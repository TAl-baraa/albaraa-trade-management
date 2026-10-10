use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, mpsc},
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Manager, WebviewWindow};
use unicode_normalization::UnicodeNormalization;

const PDF_PREFIX: &str = "مكتب البراء - ";
const PDF_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum StatementCurrency {
    Iqd,
    Usd,
}

impl StatementCurrency {
    fn arabic_label(self) -> &'static str {
        match self {
            Self::Iqd => "دينار",
            Self::Usd => "دولار",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementPdf {
    pub file_name: String,
    pub path: String,
    pub share_opened: bool,
    pub warning: Option<String>,
}

fn sanitized_customer_name(name: &str) -> String {
    let sanitized: String = name
        .trim()
        .nfc()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '-'
            } else {
                character
            }
        })
        .take(100)
        .collect();
    let sanitized = sanitized.trim_matches([' ', '.']).trim();
    if sanitized.is_empty() {
        "زبون".into()
    } else {
        sanitized.into()
    }
}

fn pdf_file_name(customer_name: &str, currency: StatementCurrency) -> String {
    format!(
        "{PDF_PREFIX}{} - كشف حساب {}.pdf",
        sanitized_customer_name(customer_name),
        currency.arabic_label()
    )
}

fn cleanup_old_statement_pdfs(directory: &Path, now: SystemTime) -> Result<(), String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("تعذر فحص ملفات كشوف الحساب المؤقتة.".into()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.starts_with(PDF_PREFIX) || !name.ends_with(".pdf") {
            continue;
        }
        let Ok(modified) = entry.metadata().and_then(|metadata| metadata.modified()) else {
            continue;
        };
        if now.duration_since(modified).unwrap_or_default() >= PDF_MAX_AGE {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

fn validate_pdf(path: &Path) -> Result<u64, String> {
    let bytes = fs::read(path).map_err(|_| "تعذر قراءة ملف كشف الحساب بعد إنشائه.".to_string())?;
    if bytes.len() < 100 || !bytes.starts_with(b"%PDF-") {
        let _ = fs::remove_file(path);
        return Err("تعذر إنشاء ملف PDF صالح لكشف الحساب.".into());
    }
    Ok(bytes.len() as u64)
}

#[cfg(windows)]
async fn open_windows_share_sheet(window: &WebviewWindow, path: &Path) -> Result<(), String> {
    use std::sync::atomic::{AtomicI64, Ordering};
    use windows::{
        ApplicationModel::DataTransfer::{DataRequestedEventArgs, DataTransferManager},
        Foundation::TypedEventHandler,
        Storage::{IStorageItem, StorageFile},
        Win32::UI::Shell::IDataTransferManagerInterop,
        core::{AgileReference, HSTRING, Interface, factory},
    };

    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
        .map_err(|error| format!("تعذر تجهيز ملف PDF للمشاركة: {error}"))?
        .await
        .map_err(|error| format!("تعذر تجهيز ملف PDF للمشاركة: {error}"))?;
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("تعذر تحديد نافذة التطبيق للمشاركة: {error}"))?;
    let hwnd_value = hwnd.0 as isize;
    let file = AgileReference::new(&file)
        .map_err(|error| format!("تعذر تجهيز ملف PDF للمشاركة: {error}"))?;
    let (sender, receiver) = mpsc::channel::<Result<(), String>>();
    window
        .run_on_main_thread(move || {
            let result = (|| -> windows::core::Result<()> {
                let interop = factory::<DataTransferManager, IDataTransferManagerInterop>()?;
                let hwnd = windows::Win32::Foundation::HWND(hwnd_value as *mut _);
                let manager: DataTransferManager = unsafe { interop.GetForWindow(hwnd)? };
                let event_token = Arc::new(AtomicI64::new(0));
                let callback_token = event_token.clone();
                let handler = TypedEventHandler::<DataTransferManager, DataRequestedEventArgs>::new(
                    move |sender, args| {
                        let result = (|| -> windows::core::Result<()> {
                            let request = args.as_ref().ok_or_else(|| {
                                windows::core::Error::new(
                                    windows::core::HRESULT(0x80004005_u32 as i32),
                                    "Missing share request",
                                )
                            })?;
                            let package = request.Request()?.Data()?;
                            package
                                .Properties()?
                                .SetTitle(&HSTRING::from("كشف حساب الزبون"))?;
                            let file = file.resolve()?;
                            let item: IStorageItem = file.cast()?;
                            let items =
                                windows_collections::IIterable::<IStorageItem>::from(vec![Some(
                                    item,
                                )]);
                            package.SetStorageItemsReadOnly(&items)?;
                            Ok(())
                        })();
                        if let Some(manager) = sender.as_ref() {
                            let token = callback_token.load(Ordering::Acquire);
                            if token != 0 {
                                let _ = manager.RemoveDataRequested(token);
                            }
                        }
                        result
                    },
                );
                let token = manager.DataRequested(&handler)?;
                event_token.store(token, Ordering::Release);
                if let Err(error) = unsafe { interop.ShowShareUIForWindow(hwnd) } {
                    let _ = manager.RemoveDataRequested(token);
                    return Err(error);
                }
                Ok(())
            })()
            .map_err(|error| format!("تعذر فتح نافذة مشاركة Windows: {error}"));
            let _ = sender.send(result);
        })
        .map_err(|error| format!("تعذر بدء نافذة مشاركة Windows: {error}"))?;
    receiver
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "انتهت مهلة فتح نافذة مشاركة Windows.".to_string())?
}

#[cfg(not(windows))]
async fn open_windows_share_sheet(_window: &WebviewWindow, _path: &Path) -> Result<(), String> {
    Err("نافذة المشاركة متاحة في تطبيق Windows فقط.".into())
}

#[cfg(windows)]
async fn print_webview_to_pdf(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, PrintToPdfCompletedHandler};
    use windows::core::{HSTRING, Interface};

    let (sender, receiver) = mpsc::channel::<Result<(), String>>();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let immediate_sender = sender.clone();
    window
        .with_webview(move |webview| unsafe {
            let start = (|| -> windows::core::Result<()> {
                let core = webview.controller().CoreWebView2()?;
                let core2: ICoreWebView2_2 = core.cast()?;
                let environment6: ICoreWebView2Environment6 = core2.Environment()?.cast()?;
                let settings = environment6.CreatePrintSettings()?;
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                settings.SetShouldPrintHeaderAndFooter(false.into())?;
                let core7: ICoreWebView2_7 = core.cast()?;
                let callback_sender = sender.clone();
                let callback =
                    PrintToPdfCompletedHandler::create(Box::new(move |error_code, success| {
                        let result = if error_code.is_ok() && success {
                            Ok(())
                        } else {
                            Err("تعذر إنشاء ملف PDF من كشف الحساب.".into())
                        };
                        if let Some(sender) = callback_sender
                            .lock()
                            .ok()
                            .and_then(|mut value| value.take())
                        {
                            let _ = sender.send(result);
                        }
                        Ok(())
                    }));
                core7.PrintToPdf(&HSTRING::from(path.as_path()), &settings, &callback)
            })();
            if let Err(error) = start
                && let Some(sender) = immediate_sender
                    .lock()
                    .ok()
                    .and_then(|mut value| value.take())
            {
                let _ = sender.send(Err(format!("تعذر بدء إنشاء ملف PDF: {error}")));
            }
        })
        .map_err(|error| format!("تعذر الوصول إلى نافذة كشف الحساب: {error}"))?;

    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(45)))
        .await
        .map_err(|_| "تعذر انتظار اكتمال إنشاء ملف PDF.".to_string())?
        .map_err(|_| "انتهت مهلة إنشاء ملف PDF. أعد المحاولة.".to_string())?
}

#[cfg(not(windows))]
async fn print_webview_to_pdf(_window: WebviewWindow, _path: PathBuf) -> Result<(), String> {
    Err("مشاركة كشف الحساب متاحة في تطبيق Windows فقط.".into())
}

#[tauri::command]
pub async fn share_statement_pdf(
    app: AppHandle,
    window: WebviewWindow,
    customer_name: String,
    currency: StatementCurrency,
) -> Result<StatementPdf, String> {
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|_| "تعذر الوصول إلى مجلد الملفات المؤقتة.".to_string())?
        .join("statement-pdfs");
    fs::create_dir_all(&directory)
        .map_err(|_| "تعذر إنشاء مجلد ملفات كشوف الحساب المؤقتة.".to_string())?;
    cleanup_old_statement_pdfs(&directory, SystemTime::now())?;
    let file_name = pdf_file_name(&customer_name, currency);
    let path = directory.join(&file_name);
    if path.exists() {
        fs::remove_file(&path).map_err(|_| {
            "ملف كشف الحساب السابق قيد الاستخدام. أغلقه ثم أعد المحاولة.".to_string()
        })?;
    }
    print_webview_to_pdf(window.clone(), path.clone()).await?;
    validate_pdf(&path)?;
    let share_result = open_windows_share_sheet(&window, &path).await;
    Ok(StatementPdf {
        file_name,
        path: path.to_string_lossy().into_owned(),
        share_opened: share_result.is_ok(),
        warning: share_result.err(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_safe_customer_statement_file_names() {
        assert_eq!(
            pdf_file_name(" أحمد محمد ", StatementCurrency::Iqd),
            "مكتب البراء - أحمد محمد - كشف حساب دينار.pdf"
        );
        assert_eq!(
            pdf_file_name("John Smith", StatementCurrency::Usd),
            "مكتب البراء - John Smith - كشف حساب دولار.pdf"
        );
        assert_eq!(
            pdf_file_name("أحمد<>:\"/\\|?* محمد.", StatementCurrency::Iqd),
            "مكتب البراء - أحمد--------- محمد - كشف حساب دينار.pdf"
        );
        assert_eq!(
            pdf_file_name("ا\u{654}حمد", StatementCurrency::Usd),
            "مكتب البراء - أحمد - كشف حساب دولار.pdf"
        );
        assert_eq!(
            pdf_file_name("...", StatementCurrency::Iqd),
            "مكتب البراء - زبون - كشف حساب دينار.pdf"
        );
    }

    #[test]
    fn preserves_unicode_in_statement_file_name_on_disk() {
        let directory = std::env::temp_dir().join(format!(
            "albaraa-statement-unicode-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let file_name = pdf_file_name("أحمد محمد", StatementCurrency::Iqd);
        let path = directory.join(&file_name);
        fs::write(&path, b"test").unwrap();

        assert_eq!(path.file_name().unwrap().to_str().unwrap(), file_name);
        assert!(path.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn validates_pdf_output_and_rejects_invalid_content() {
        let directory =
            std::env::temp_dir().join(format!("albaraa-statement-pdf-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let valid = directory.join("valid.pdf");
        let mut content = b"%PDF-1.7\n".to_vec();
        content.resize(128, b'0');
        fs::write(&valid, &content).unwrap();
        assert_eq!(validate_pdf(&valid).unwrap(), content.len() as u64);
        let invalid = directory.join("invalid.pdf");
        fs::write(&invalid, b"not a pdf").unwrap();
        assert!(validate_pdf(&invalid).is_err());
        assert!(!invalid.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cleans_only_expired_statement_pdf_files() {
        let directory = std::env::temp_dir().join(format!(
            "albaraa-statement-cleanup-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let statement = directory.join("مكتب البراء - قديم - كشف حساب دينار.pdf");
        let unrelated = directory.join("keep.pdf");
        fs::write(&statement, b"old").unwrap();
        fs::write(&unrelated, b"keep").unwrap();
        cleanup_old_statement_pdfs(
            &directory,
            SystemTime::now() + PDF_MAX_AGE + Duration::from_secs(1),
        )
        .unwrap();
        assert!(!statement.exists());
        assert!(unrelated.exists());
        fs::remove_dir_all(directory).unwrap();
    }
}

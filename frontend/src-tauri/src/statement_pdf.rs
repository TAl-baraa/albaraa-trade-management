use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use unicode_normalization::UnicodeNormalization;

const PDF_PREFIX: &str = "مكتب البراء - ";
const PDF_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
static UNIQUE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementExportBatch {
    pub batch_id: String,
    pub folder_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStatementPdf {
    pub file_name: String,
    pub path: String,
}

#[derive(Default)]
pub struct StatementExportState {
    directories: Mutex<HashMap<String, PathBuf>>,
    pdf_in_progress: Arc<AtomicBool>,
}

struct PdfGenerationPermit(Arc<AtomicBool>);

impl Drop for PdfGenerationPermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl StatementExportState {
    fn acquire_pdf_permit(&self) -> Result<PdfGenerationPermit, String> {
        self.pdf_in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| PdfGenerationPermit(self.pdf_in_progress.clone()))
            .map_err(|_| "يجري إنشاء ملف PDF آخر حاليًا. انتظر اكتماله ثم أعد المحاولة.".into())
    }

    fn directory(&self, batch_id: &str) -> Result<PathBuf, String> {
        self.directories
            .lock()
            .map_err(|_| "تعذر الوصول إلى جلسات تصدير كشوف الحساب.".to_string())?
            .get(batch_id)
            .cloned()
            .ok_or_else(|| "دفعة تصدير كشوف الحساب غير معروفة أو تم إنهاؤها.".to_string())
    }

    fn finish(&self, batch_id: &str) -> Result<PathBuf, String> {
        self.directories
            .lock()
            .map_err(|_| "تعذر الوصول إلى جلسات تصدير كشوف الحساب.".to_string())?
            .remove(batch_id)
            .ok_or_else(|| "دفعة تصدير كشوف الحساب غير معروفة أو تم إنهاؤها.".to_string())
    }
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

fn unique_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}-{:x}-{:x}", std::process::id(), nanos, counter)
}

#[cfg(windows)]
fn local_calendar_date() -> String {
    use windows::Win32::System::SystemInformation::GetLocalTime;
    let local = unsafe { GetLocalTime() };
    format!("{:04}-{:02}-{:02}", local.wYear, local.wMonth, local.wDay)
}

#[cfg(not(windows))]
fn local_calendar_date() -> String {
    let days = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 86_400;
    let (year, month, day) = civil_date_from_days(days as i64);
    format!("{year:04}-{month:02}-{day:02}")
}

#[cfg(not(windows))]
fn civil_date_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn create_batch_directory(desktop: &Path, date: &str) -> Result<PathBuf, String> {
    for sequence in 1..=10_000 {
        let folder_name = if sequence == 1 {
            date.to_string()
        } else {
            format!("{date} ({sequence})")
        };
        let path = desktop.join(folder_name);
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "تعذر إنشاء مجلد تصدير كشوف الحساب على سطح المكتب: {error}"
                ));
            }
        }
    }
    Err("تعذر إنشاء مجلد تصدير جديد بسبب كثرة المجلدات الموجودة لهذا اليوم.".into())
}

fn collision_file_name(base_name: &str, sequence: usize) -> String {
    if sequence == 1 {
        return base_name.to_string();
    }
    let stem = base_name.strip_suffix(".pdf").unwrap_or(base_name);
    format!("{stem} ({sequence}).pdf")
}

fn persist_pdf_without_overwrite(
    temporary_path: &Path,
    directory: &Path,
    base_name: &str,
) -> Result<(String, PathBuf), String> {
    for sequence in 1..=10_000 {
        let file_name = collision_file_name(base_name, sequence);
        let final_path = directory.join(&file_name);
        let mut destination = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&final_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("تعذر إنشاء ملف كشف الحساب: {error}")),
        };
        let copy_result = (|| {
            let mut source = fs::File::open(temporary_path)?;
            io::copy(&mut source, &mut destination)?;
            destination.sync_all()
        })();
        if let Err(error) = copy_result {
            drop(destination);
            let _ = fs::remove_file(&final_path);
            return Err(format!("تعذر حفظ ملف كشف الحساب: {error}"));
        }
        return Ok((file_name, final_path));
    }
    Err("تعذر اختيار اسم غير مستخدم لملف كشف الحساب.".into())
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
    state: State<'_, StatementExportState>,
    customer_name: String,
    currency: StatementCurrency,
) -> Result<StatementPdf, String> {
    let _permit = state.acquire_pdf_permit()?;
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

#[tauri::command]
pub fn create_statement_export_batch(
    app: AppHandle,
    state: State<'_, StatementExportState>,
) -> Result<StatementExportBatch, String> {
    let desktop = app
        .path()
        .desktop_dir()
        .map_err(|_| "تعذر الوصول إلى مجلد سطح المكتب للمستخدم الحالي.".to_string())?;
    let mut directories = state
        .directories
        .lock()
        .map_err(|_| "تعذر الوصول إلى جلسات تصدير كشوف الحساب.".to_string())?;
    let directory = create_batch_directory(&desktop, &local_calendar_date())?;
    let batch_id = loop {
        let candidate = unique_token();
        if !directories.contains_key(&candidate) {
            break candidate;
        }
    };
    directories.insert(batch_id.clone(), directory.clone());
    Ok(StatementExportBatch {
        batch_id,
        folder_path: directory.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn export_statement_pdf_to_batch(
    window: WebviewWindow,
    state: State<'_, StatementExportState>,
    batch_id: String,
    customer_name: String,
    currency: StatementCurrency,
) -> Result<BatchStatementPdf, String> {
    let directory = state.directory(&batch_id)?;
    let _permit = state.acquire_pdf_permit()?;
    let temporary_path = directory.join(format!(".albaraa-statement-{}.pdf", unique_token()));
    let print_result = print_webview_to_pdf(window, temporary_path.clone()).await;
    if let Err(error) = print_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    validate_pdf(&temporary_path)?;
    let base_name = pdf_file_name(&customer_name, currency);
    let persisted = persist_pdf_without_overwrite(&temporary_path, &directory, &base_name);
    let _ = fs::remove_file(&temporary_path);
    let (file_name, path) = persisted?;
    Ok(BatchStatementPdf {
        file_name,
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn finish_statement_export_batch(
    state: State<'_, StatementExportState>,
    batch_id: String,
) -> Result<StatementExportBatch, String> {
    let _permit = state.acquire_pdf_permit()?;
    let directory = state.finish(&batch_id)?;
    Ok(StatementExportBatch {
        batch_id,
        folder_path: directory.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(label: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "albaraa-statement-{label}-{}-{}",
            std::process::id(),
            unique_token()
        ));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn valid_pdf_fixture(path: &Path) {
        let mut content = b"%PDF-1.7\n".to_vec();
        content.resize(128, b'0');
        fs::write(path, content).unwrap();
    }

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

    #[test]
    fn creates_date_named_batch_directories_without_reusing_existing_folders() {
        let desktop = test_directory("batch-folders");
        let first = create_batch_directory(&desktop, "2026-10-19").unwrap();
        let second = create_batch_directory(&desktop, "2026-10-19").unwrap();
        let third = create_batch_directory(&desktop, "2026-10-19").unwrap();
        assert_eq!(first.file_name().unwrap(), "2026-10-19");
        assert_eq!(second.file_name().unwrap(), "2026-10-19 (2)");
        assert_eq!(third.file_name().unwrap(), "2026-10-19 (3)");
        fs::remove_dir_all(desktop).unwrap();
    }

    #[test]
    fn preserves_existing_pdfs_and_suffixes_duplicate_customer_file_names() {
        let directory = test_directory("file-collisions");
        let base_name = pdf_file_name("أحمد محمد", StatementCurrency::Iqd);
        let first_source = directory.join("first.tmp");
        valid_pdf_fixture(&first_source);
        let (first_name, first_path) =
            persist_pdf_without_overwrite(&first_source, &directory, &base_name).unwrap();
        let first_bytes = fs::read(&first_path).unwrap();

        let second_source = directory.join("second.tmp");
        valid_pdf_fixture(&second_source);
        let (second_name, second_path) =
            persist_pdf_without_overwrite(&second_source, &directory, &base_name).unwrap();

        assert_eq!(first_name, base_name);
        assert!(second_name.ends_with(" (2).pdf"));
        assert_ne!(first_path, second_path);
        assert_eq!(fs::read(first_path).unwrap(), first_bytes);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn sanitized_names_cannot_escape_the_batch_directory() {
        let directory = test_directory("path-safety");
        let file_name = pdf_file_name("../../عميل\\خاص", StatementCurrency::Usd);
        let source = directory.join("source.tmp");
        valid_pdf_fixture(&source);
        let (_, path) = persist_pdf_without_overwrite(&source, &directory, &file_name).unwrap();
        assert_eq!(path.parent(), Some(directory.as_path()));
        assert!(!file_name.contains('/'));
        assert!(!file_name.contains('\\'));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_pdf_validation_does_not_remove_previous_successes() {
        let directory = test_directory("partial-failure");
        let successful = directory.join("successful.pdf");
        valid_pdf_fixture(&successful);
        let invalid = directory.join("invalid.pdf");
        fs::write(&invalid, b"invalid").unwrap();

        assert!(validate_pdf(&invalid).is_err());
        assert!(!invalid.exists());
        assert!(successful.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_unknown_and_finished_batch_identifiers() {
        let state = StatementExportState::default();
        assert!(state.directory("unknown").is_err());
        assert!(state.finish("unknown").is_err());

        let directory = test_directory("batch-state");
        state
            .directories
            .lock()
            .unwrap()
            .insert("batch-id".into(), directory.clone());
        assert_eq!(state.finish("batch-id").unwrap(), directory);
        assert!(state.directory("batch-id").is_err());
        assert!(state.finish("batch-id").is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn permits_only_one_pdf_generation_at_a_time() {
        let state = StatementExportState::default();
        let permit = state.acquire_pdf_permit().unwrap();
        assert!(state.acquire_pdf_permit().is_err());
        drop(permit);
        assert!(state.acquire_pdf_permit().is_ok());
    }

    #[test]
    fn serializes_batch_results_with_frontend_field_names() {
        let batch = StatementExportBatch {
            batch_id: "opaque-id".into(),
            folder_path: "C:\\Desktop\\2026-10-19".into(),
        };
        assert_eq!(
            serde_json::to_value(batch).unwrap(),
            serde_json::json!({
                "batchId": "opaque-id",
                "folderPath": "C:\\Desktop\\2026-10-19"
            })
        );
        let pdf = BatchStatementPdf {
            file_name: "statement.pdf".into(),
            path: "C:\\Desktop\\2026-10-19\\statement.pdf".into(),
        };
        assert_eq!(
            serde_json::to_value(pdf).unwrap(),
            serde_json::json!({
                "fileName": "statement.pdf",
                "path": "C:\\Desktop\\2026-10-19\\statement.pdf"
            })
        );
    }
}

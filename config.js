/* Apps Script web uygulaması adresini buraya yapıştırın (README > Adım 4).
   Boş bırakılırsa her kullanıcı adresi panelde Ayarlar > Gelişmiş kısmına kendisi girer. */
window.ORIGIN_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbwZIH_gsngbpT2e2Vs7WJ2tsFA5lBa6OI9Xr0SHMes0a7azABtNcNnkMikEpBD2E5AXXA/exec',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1trnyWmsWRn3ebtaKqkzJbxB2-KZzeXw4u6nR40iemaw/edit',   // Google E-Tablo bağlantısı (E-Tabloya aktar düğmesi bunu açar)
  // Kişisel Google Takvim eşitlemesi için OAuth istemci kimliği (README > Takvim kurulumu)
  googleClientId: '',
  pollSeconds: 30
};

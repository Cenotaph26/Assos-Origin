# Origin Kuruluş Takibi

Assos Extra · Origin üretim merkezinin inşaattan açılışa kadar tüm adımlarını takip eden panel.

- Telefonda ve bilgisayarda çalışır. Ana ekrana eklenince uygulama gibi açılır.
- Girilen her değişiklik **Google E-Tablo**'ya kaydedilir. Ekipteki herkes aynı veriyi görür.
- Panel değişiklikleri birkaç saniye içinde kaydeder, diğer cihazlar en geç 30 saniyede günceller.
- Bağlantı koptuğunda değişiklikler telefonda bekletilir ve internet gelince gönderilir.
- **Excel:**
  - Paneldeki "Excel'e aktar" düğmesi biçimli bir `.xlsx` indirir.
  - E-tablo her gece 23:00'te Drive'daki "Origin Excel Yedekleri" klasörüne `.xlsx` olarak yedeklenir. Son 30 yedek saklanır.
- **Değişiklik geçmişi:** Kim, ne zaman, neyi değiştirdi "Geçmiş" sayfasına yazılır. Paneldeki "Geçmiş" düğmesinden her değişiklik tek tek geri alınabilir.
- **Toplantılar:** Panelden eklenen toplantılar, "Takvimimle eşitle" düğmesine basan kişinin **kendi** Google Takvim'ine 1 gün ve 1 saat önce hatırlatıcıyla eklenir. Kişi takviminde saati değiştirirse panel de güncellenir. Panelden silinen toplantı takvimden de kalkar.
- **E-Tablo'da elle düzenleme:** E-Tablo'daki "Takip" sayfasında elle yapılan düzenlemeler de panele yansır.

## Kurulum (bir kez, yaklaşık 10 dakika)

### 1. Google E-Tablosu
1. [sheets.new](https://sheets.new) ile boş bir e-tablo açın. Adını **Origin Takip** yapın.
2. Menüden **Uzantılar → Apps Script**'i açın.

### 2. Kodu yapıştırın
1. Açılan editörde `Code.gs` içeriğini silin.
2. Bu depodaki [`apps-script/Code.gs`](apps-script/Code.gs) dosyasının tamamını yapıştırın.
3. En üstteki `EKIP_SIFRESI` değerini ekibe vereceğiniz şifreyle değiştirin.
4. **Kaydet** düğmesine basın.
5. Proje ayarlarında (⚙) saat dilimini **(GMT+03:00) Istanbul** yapın.

### 3. Kurulumu çalıştırın
1. Üstteki fonksiyon listesinden `kurulum` seçin ve **Çalıştır**'a basın.
2. Google izin isteyecek: **İzinleri incele → hesabınız → Gelişmiş → Origin Takip'e git (güvenli değil) → İzin ver**.
   - Bu uyarı, betiği sizin yazdığınız için çıkar. E-tabloya, Drive'a yedek yazmaya ve zamanlayıcıya erişim istenir.
3. E-tabloda **Takip** ve **Özet** sayfaları oluşur, gece yedeği kurulur.

### 4. Web uygulaması olarak yayınlayın
1. **Dağıt → Yeni dağıtım** seçin. Tür olarak **Web uygulaması**'nı seçin.
2. Ayarları şöyle yapın:
   - **Şu kullanıcı olarak yürüt:** Ben
   - **Erişimi olan kullanıcılar:** Herkes
3. **Dağıt**'a basın. Verilen `https://script.google.com/macros/s/…/exec` adresini kopyalayın.
4. Bu depodaki `config.js` dosyasında `apiUrl: ''` alanına bu adresi yapıştırıp kaydedin.

> **Kodu sonra değiştirirseniz:** Yeni dağıtım açmak yerine **Dağıt → Dağıtımları yönet → Düzenle → Sürüm: Yeni sürüm** yolunu kullanın. Böylece adres değişmez.

### 5. GitHub Pages'i açın
1. Depoda **Settings → Pages** bölümüne gidin.
2. **Source:** Deploy from a branch. **Branch:** `main`, klasör `/ (root)` seçip **Save**'e basın.
3. Birkaç dakika sonra panel `https://cenotaph26.github.io/Assos-Origin/` adresinde açılır.

Ücretsiz GitHub hesabında Pages yalnızca public depolarda çalışır. Depoyu public yapmak verileri açığa çıkarmaz, çünkü veriler e-tabloda durur ve şifreyle korunur. Depoda yalnızca kod ve başlangıç listesi bulunur.

### 6. İlk açılış
1. Paneli açın ve ekip şifresini girin.
2. E-tablo boşsa panel başlangıç listesini e-tabloya yazar.
3. Telefonda: **Paylaş → Ana Ekrana Ekle** (iPhone) ya da **⋮ → Ana ekrana ekle** (Android).

## Güncelleme (değişiklik geçmişi ve toplantılar sürümü)

Panel kendiliğinden güncellenir. E-tablodaki kodu ise bir kez güncellemeniz gerekir:
1. E-tabloda **Uzantılar → Apps Script**'i açın.
2. `Code.gs` içeriğini silin ve bu depodaki [`apps-script/Code.gs`](apps-script/Code.gs) dosyasının tamamını yapıştırın.
3. `EKIP_SIFRESI` satırına mevcut şifrenizi yeniden yazın ve **Kaydet**'e basın.
4. Fonksiyon listesinden `kurulum`'u seçip **Çalıştır**'a basın. Böylece "Toplantılar" ve "Geçmiş" sayfaları kurulur.
5. **Dağıt → Dağıtımları yönet** yolunu izleyin. Kalem simgesine basın, **Sürüm: Yeni sürüm** seçip **Dağıt**'a basın. Adres aynı kalır.

## Kişisel takvim kurulumu (bir kez, yönetici yapar, yaklaşık 10 dakika)

Panelin her kullanıcının kendi takvimine yazabilmesi için Google'dan bir "istemci kimliği" alınır. Bu işlem ücretsizdir.

1. [console.cloud.google.com](https://console.cloud.google.com) adresine girin. Üstten **Yeni proje** açın, adını **Origin Takip** yapın.
2. **API'ler ve Hizmetler → Kitaplık** bölümünde **Google Calendar API**'yi bulup **Etkinleştir**'e basın.
3. **Google Auth Platform** (ya da **OAuth izin ekranı**) bölümünde:
   - **Uygulama adı:** Origin Takip. Destek e-postası olarak kendi adresinizi girin.
   - **Kitle (Audience):**
     - Şirketinizin Google Workspace hesabı varsa **Dahili (Internal)** seçin. Bu durumda tüm şirket hesapları kullanabilir.
     - Yoksa **Harici (External)** seçin ve **Test kullanıcıları** bölümüne ekipteki herkesin Gmail adresini ekleyin. En fazla 100 kişi eklenebilir.
   - **Veri erişimi (Scopes):** `.../auth/calendar.events` iznini ekleyin.
4. **İstemciler (Clients) → İstemci oluştur** yolunu izleyin. Tür olarak **Web uygulaması**'nı seçin.
   - **Yetkili JavaScript kaynakları** alanına `https://cenotaph26.github.io` yazın.
   - **Oluştur**'a basın.
5. Size verilen `….apps.googleusercontent.com` ile biten **İstemci kimliği**'ni `config.js` dosyasında `googleClientId` alanına yapıştırın.

**İlk kullanımda:** Her kişi "Takvimimle eşitle"ye ilk bastığında Google hesabını seçer ve takvim izni verir. Harici modda "Google bu uygulamayı doğrulamadı" uyarısı çıkar; **Devam**'a basmak yeterli, çünkü uygulama sizin.

**Bundan sonra:** O oturumda toplantı eklendiğinde ya da değiştiğinde takvim kendiliğinden güncellenir. Sayfa yeniden açıldığında düğmeye bir kez basmak yeterlidir.

İstemci kimliği girilmemişse her toplantıda "+ Takvimime ekle" bağlantısı çıkar. Bu bağlantı toplantıyı tek tıkla kişinin takvimine ekler, ama eşitleme ve özel hatırlatıcı içermez.

## Günlük kullanım

| İş | Nerede |
|---|---|
| Durum değiştirmek | Durum düğmesine dokunun: Bekliyor → Devam → Bitti → Engel var |
| Bir aşamaya gitmek | Üstteki büyük karta dokunun; aşama açılır ve oraya kaydırılır |
| Adımı taşımak | Durum düğmesine ya da soldaki ⋮⋮ tutamağına basılı tutup sürükleyin (başka aşamaya da bırakılabilir) |
| Adım / aşama eklemek, silmek | "+ Aşama ekle" kartların altında, "+ Adım ekle" açılan aşamanın içinde (silmek için iki kez dokunun) |
| Son değişikliğinizi geri almak | Araç çubuğunda "Geri al" |
| Herhangi bir eski değişikliği geri almak | "Geçmiş" → ilgili satırda "Geri al" (iki kez dokunun) |
| Toplantı eklemek / düzenlemek | Toplantılar bölümü → "+ Toplantı ekle" ya da ✎ |
| Kendi takviminizle eşitlemek | "Takvimimle eşitle" (ilk seferde Google izni istenir) |
| Google E-Tabloyu açmak | "E-Tabloya aktar": bekleyen değişiklikleri gönderir ve e-tabloyu açar |
| Biçimli Excel almak | "Excel indir" |
| Günlük Excel yedekleri | Google Drive → Origin Excel Yedekleri |
| Anında yedek | E-tablo menüsü → Origin → Şimdi Excel yedeği al |
| E-tablonun görünümünü yenilemek | Apps Script'te `gorunum` fonksiyonunu çalıştırın |
| Toplu düzenleme | E-tablodaki Takip sayfası. Gizli `asama_id` / `adim_id` sütunlarına dokunmayın. Yeni satır eklerken Aşama adını mevcut bir aşamayla aynı yazın |

Durum göstergesi:
- **Yeşil:** Kaydedildi.
- **Turuncu:** Kaydediliyor.
- **Kırmızı:** Çevrimdışı. Değişiklikler bekliyor ve internet gelince gönderilecek.
- **Gri:** Bağlantı kurulmamış. Veriler yalnızca bu cihazda.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `index.html` | Panel ve başlangıç listesi (`#seed`) |
| `config.js` | Apps Script adresi |
| `js/app.js` | Panel ve eşitleme |
| `js/ops.js` | Veri işlemleri (Code.gs'deki `applyOp` ile aynı) |
| `js/export.js` | Excel dışa aktarma |
| `sw.js`, `manifest.webmanifest`, `icons/` | Çevrimdışı açılış ve ana ekran simgesi |
| `apps-script/Code.gs` | Google E-Tablo arka ucu |

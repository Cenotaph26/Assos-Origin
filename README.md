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
- **Toplantılar:** Panelden eklenen toplantılar Google Takvim'e 1 gün ve 1 saat önce hatırlatıcıyla eklenir. Katılımcılara davet gider. "Takvimimle eşitle" düğmesi ve saatlik otomatik eşitleme, takvimde yapılan saat değişikliklerini panele de getirir.
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
3. Birkaç dakika sonra panel `https://cenotaph26.github.io/assos-origin/` adresinde açılır.

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
4. Fonksiyon listesinden `kurulum`'u seçip **Çalıştır**'a basın. Google bu sefer **Takvim** izni de isteyecek; izin verin. Böylece "Toplantılar" ve "Geçmiş" sayfaları ile saatlik takvim eşitlemesi kurulur.
5. **Dağıt → Dağıtımları yönet** yolunu izleyin. Kalem simgesine basın, **Sürüm: Yeni sürüm** seçip **Dağıt**'a basın. Adres aynı kalır.

Toplantılar, web uygulamasını yayınlayan hesabın ana takvimine eklenir. Başka bir takvim kullanmak isterseniz `Code.gs` içindeki `TAKVIM_ID` satırına o takvimin kimliğini yazın. Kimliği Google Takvim'de takvim ayarları → "Takvimi entegre et" bölümünde bulabilirsiniz.

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
| Takvimle eşitlemek | "Takvimimle eşitle" (ayrıca her saat kendiliğinden) |
| Google E-Tabloyu açmak | "E-Tabloya aktar": bekleyen değişiklikleri gönderir ve e-tabloyu açar |
| Biçimli Excel almak | "Excel indir" |
| Günlük Excel yedekleri | Google Drive → Origin Excel Yedekleri |
| Anında yedek | E-tablo menüsü → Origin → Şimdi Excel yedeği al |
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

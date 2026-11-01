# راهنمای Docker و SSH

وضعیت: آماده‌سازی منبع انجام شده؛ اجرای Engine محلی پاسخ نداده است. تا زمانی که بیلد و تست ایمیج موفق نشده، مرحلهٔ انتشار Docker انجام نمی‌شود. اصلاح ورود بازیکن مسیر انتشار جداگانه روی اجرای فعلی دارد.

## شروع روی ویندوز

از PowerShell داخل پوشهٔ همین پروژه اجرا کنید:

```powershell
& ./ops/docker/build-images.ps1 -CheckOnly
```

خروجی PASS یعنی Engine لینوکس amd64 در دسترس است. در خطای timeout، هیچ build شروع نشده؛ Docker Desktop را بررسی کنید. Restart ممکن است دیتابیس‌های توسعه را هم قطع کند، بنابراین خودکار انجام نمی‌شود.

ساخت دو ایمیج از commit تمیز و فایل‌های tracked:

```powershell
& ./ops/docker/build-images.ps1
```

این فرمان خروجی را در پوشهٔ خصوصی `.deploy/docker/<commit>` ذخیره می‌کند. TAR از طریق `docker image save -o` ساخته می‌شود؛ از pipe باینری در PowerShell استفاده نمی‌شود.

```powershell
$release = (git rev-parse HEAD).Trim()
& ./ops/docker/test-images.ps1 -Release $release
```

تست در پروژهٔ جدا و پورت‌های 23100/24100 اجرا می‌شود. migration فقط به دیتابیس آزمایشیِ همان Compose وصل است. داده و volumeها خودکار حذف نمی‌شوند. این تستِ اولیه جای آزمون کامل احراز هویت، ماندگاری، حالت‌های خطا و بررسی محتوای image را نمی‌گیرد.

## SSH

نام `dndnerds-vps` در فایل خصوصی SSH ویندوز با کلید قبلی تنظیم و ورود read-only با آن آزمایش شد. هیچ کلید خصوصی به سرور کپی نشده و مجوزی گسترش نیافته است. فایل واقعی SSH، شامل نشانی میزبان و مسیر کلید، را در پروژه commit نکنید؛ نام عمومی alias به‌تنهایی اطلاعات ورود ندارد. قبل از اولین پذیرش کلید میزبان جدید، fingerprint را از کنسول تادسرور مستقل مقایسه کنید؛ کلید عوض‌شده را خودکار نپذیرید.

```powershell
ssh -o BatchMode=yes dndnerds-vps 'whoami; uname -m'
```

عامل محلی از همین ترمینال مجاز استفاده می‌کند؛ چت ابری به کلید خصوصی کامپیوتر دسترسی خودکار ندارد. حساب فعلی قبلاً مجاز بوده است؛ ساخت حساب deploy و دسترسی Docker که می‌تواند هم‌ارز root باشد، خودکار انجام نمی‌شود.

## انتقال و staging پس از تست ایمیج

مسیر خصوصی و موجود staging را در prompt زیر وارد کنید؛ اسکریپت مسیر را اعتبارسنجی می‌کند و دستور را روی همان alias اجرا می‌کند:

```powershell
$release = (git rev-parse HEAD).Trim()
$remoteDirectory = Read-Host 'مسیر موجود و تأییدشدهٔ staging روی سرور'
& ./ops/docker/transfer-images.ps1 -Release $release -RemoteDirectory $remoteDirectory
```

انتقال، SHA256 را در هر دو سمت بررسی می‌کند و چیزی را load یا جایگزین نمی‌کند. پیش از مرحلهٔ سرور، دو runtime env خصوصی را از محیط مؤثر فعلی آماده کنید. DATABASE_URL و REDIS_URL باید نام کانتینر داخل شبکهٔ موجود را داشته باشند؛ localhost داخل کانتینر به میزبان اشاره نمی‌کند. همان VTT_BRIDGE_SECRET مؤثر فعلی باید در Web و API حفظ شود؛ سرویس قدیمی ممکن است آن را هنگام شروع مشتق کرده باشد.

فایل‌های نمونهٔ `ops/docker/*.env.example` فقط نام و placeholder دارند. فایل واقعی باید خارج Git و با دسترسی محدود بماند. فایل support-public.json و پوشهٔ مدارک باید از مسیر موجود mount شوند؛ ایجاد مسیر اشتباه خودکار ممنوع است. مالکیت پوشهٔ مدارک را قبل از اجرا برای کاربر node بررسی کنید؛ مجوزهای دادهٔ موجود بدون بررسی تغییر نکند.

در bash سرور، فقط پس از بررسی snapshot و مسیرها:

```bash
read -r -p 'مسیر پوشهٔ release: ' RELEASE_DIR
read -r -p 'مسیر TAR: ' IMAGE_TAR
read -r -p 'SHA256 تأییدشده: ' IMAGE_SHA256
read -r -p 'commit چهل‌حرفی: ' RELEASE_COMMIT
read -r -p 'مسیر env خصوصی تنظیمات Compose: ' COMPOSE_SETTINGS
bash "$RELEASE_DIR/ops/docker/stage-images.sh" "$IMAGE_TAR" "$IMAGE_SHA256" "$RELEASE_COMMIT" "$COMPOSE_SETTINGS"
```

این مرحله فقط Web/API را روی پورت‌های loopback جدا شروع می‌کند. Compose production دیتابیس جدیدی تعریف نمی‌کند و worker مالی به‌طور پیش‌فرض خاموش است. بررسی health روی /ready و /login، اتصال Resend، کوکی‌ها، VTT، فایل‌های static و websocket پیش از درخواست cutover لازم است.

## تعویض ترافیک

هنوز مجاز به اجرای دستور تعویض نیستید: Engine، ایمیج، تست startup و مسیر proxy جدید باید اثبات شوند. سرویس فعلی umbrella را نباید متوقف کرد؛ VTT هم زیر همان سرویس است. طرح نهایی باید proxy به Web جدید را عوض کند و VTT/LiveKit/ایمیل را نگه دارد. دستور دقیق بر اساس فایل زنده، همراه rollback، در مرحلهٔ بررسیِ آمادهٔ انتشار ارائه خواهد شد؛ حدس زدن جایگزینی کل Nginx ممنوع است.

مراجع: [شبکهٔ Compose](https://docs.docker.com/compose/how-tos/networking/)، [ذخیرهٔ ایمیج](https://docs.docker.com/reference/cli/docker/image/save/)، [Next standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

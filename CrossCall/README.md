# CrossCall — تطبيق الاتصالات الصوتية والمرئية متعدد المنصات

**CrossCall** هو نظام اتصالات صوتية ومرئية فورية يعمل عبر **Android** و**iOS** و**متصفحات الويب**، مبني على معمارية SFU ذاتية الاستضافة باستخدام **LiveKit** و**Coturn (TURN/STUN)** و**PostgreSQL** و**Redis** و**Fastify**.

---

## 1. القرارات المعمارية (Architecture Decisions)

- **Backend (Fastify + TypeScript)**: تم اختيار **Fastify** بدلاً من NestJS بسبب انخفاض استهلاك الذاكرة على خادم VPS واحد، وسرعة التحقق من المدخلات، وسلاسة دمج WebSocket لإشارات المكالمات الفورية وإصدار رموز LiveKit JWT حصرياً من الخادم.
- **Calling Engine (LiveKit SFU + Coturn)**: استخدام LiveKit مستضاف ذاتياً مع دعم Simulcast وAdaptive Bitrate وNetwork Recovery، مع TURN/STUN عبر Coturn لاختراق جدران الحماية (NAT Traversal).
- **الأمان والخصوصية**:
  - لا يتم تخزين مفاتيح LiveKit أو أسرار JWT في تطبيق Flutter أو المتصفح.
  - تشفير النقل عبر HTTPS/WSS وDTLS-SRTP في WebRTC.
  - **ملاحظة صادقة حول التشفير من طرف إلى طرف (E2EE)**: تشفير WebRTC القياسي يؤمّن النقل حتى خادم SFU؛ تفعيل E2EE الحقيقي يتطلب تفعيل Insertable Streams / FrameCryptor وتبادل مفاتيح الغرفة بين الأطراف، ولا يُعلن كـ E2EE مكتمل إلا عند تفعيل FrameCryptor فعلياً.
  - **ملاحظة حول استقبال المكالمات في الخلفية**: على iOS يتطلب PushKit + CallKit عبر APNs؛ على Android يتطلب FCM ذي أولوية عالية + Android Telecom API؛ أما على متصفح الويب عبر Web Push فاستقبال الإشعارات يعتمد على بقاء المتصفح أو Service Worker نشطاً وفق قيود نظام التشغيل والمتصفح ولا يمكن ضمانه عند إغلاق المتصفح كلياً.

---

## 2. هيكل المشروع

```text
CrossCall/
├── apps/mobile/          # تطبيق Flutter (Android, iOS, Web) مع Riverpod وGoRouter وLiveKit
├── backend/              # خادم Fastify + TypeScript + إصدار رموز LiveKit
├── database/
│   ├── migrations/       # ملفات ترحيل PostgreSQL (14 جدولاً مع الفهارس والقيود)
│   └── seeds/            # بيانات أولية غير امتيازية للتطوير
├── infrastructure/
│   ├── livekit/          # إعدادات LiveKit SFU
│   ├── coturn/           # إعدادات خادم TURN/STUN
│   ├── nginx/            # إعدادات Reverse Proxy + HTTPS/WSS
│   └── backups/          # سكربت النسخ الاحتياطي التلقائي لقاعدة البيانات
├── docs/                 # توثيق التقدم المرحلي
├── docker-compose.yml    # تشغيل المنظومة الكاملة عبر Docker
└── .env.example          # قالب متغيرات البيئة (بدون أسرار)
```

---

## 3. تشغيل الخادم على Ubuntu VPS

1. جهز خادم Ubuntu 22.04/24.04 وافتح المنافذ: `80/tcp`, `443/tcp`, `3478/udp`, `5349/tcp`, `7881/tcp`, `50000:50100/udp`.
2. انسخ ملف البيئة وأدخل الأسرار الحقيقية:
   ```bash
   cp .env.example .env
   ```
3. شغل الخدمات عبر Docker Compose:
   ```bash
   docker compose up -d --build
   ```
4. استخرج شهادات SSL عبر Certbot ثم أعد تحميل Nginx.
5. فعّل النسخ الاحتياطي اليومي عبر `cron` باستخدام `infrastructure/backups/backup.sh`.

---

## 4. تعليمات البناء للعملاء (Android / iOS / Web)

- **Android APK / AAB**:
  ```bash
  cd apps/mobile
  flutter build apk --release --dart-define=API_BASE_URL=https://calls.example.com
  flutter build appbundle --release --dart-define=API_BASE_URL=https://calls.example.com
  ```
- **iOS IPA** (يتطلب جهاز macOS + Xcode + شهادة VoIP APNs):
  ```bash
  cd apps/mobile
  flutter build ipa --release --dart-define=API_BASE_URL=https://calls.example.com
  ```
- **Web Production Build**:
  ```bash
  cd apps/mobile
  flutter build web --release --dart-define=API_BASE_URL=https://calls.example.com
  ```

---

## 5. المعاينة الحية التفاعلية في بيئة العمل الحالية

بما أن أدوات Flutter SDK وDocker غير مثبتة داخل حاوية المعاينة السحابية هذه، تم تشغيل تطبيق الويب الفعلي وخادم الإشارات الحية (Express + WebSockets + WebRTC + Admin Console) مباشرة على المنفذ `3000` لتجربة جميع الشاشات الـ 25، المصادقة، البحث، جهات الاتصال، المكالمات الفردية والجماعية، سجل المكالمات، الإشعارات، ودعم العربية RTL / الإنجليزية LTR، والوضع الداكن والفاتح.

---

## 6. نظام المصادقة الرسمي (Google OAuth 2.0 + Sign in with Apple + Email / OTP)

تم ربط المشروع بنظام مصادقة موحّد بدون أي حسابات تجريبية أو وهمية، مع معرّف مستخدم واحد ثابت لكل حساب (`user_id`) وجدول هويات مرتبطة (`user_identities`):
- **Google Sign-In (OIDC + PKCE)** عبر الويب وAndroid وiOS.
- **Sign in with Apple** أصلي على iOS (`Runner.entitlements`) وOAuth (`form_post`) على الويب وAndroid، مع معالجة Hide My Email والتقاط الاسم الأول عند أول دخول فقط.
- **ربط الحسابات الآمن**: عدم الدمج التلقائي بالبريد الإلكتروني وحظر فك ربط آخر وسيلة دخول متبقية.

راجع الأدلة التفصيلية:
- `docs/GOOGLE_CLOUD_SETUP.md`
- `docs/APPLE_DEVELOPER_SETUP.md`
- `docs/SUPABASE_SETUP.md`


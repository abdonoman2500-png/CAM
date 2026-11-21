# دليل إعداد Supabase Auth وقاعدة البيانات لمشروع CrossCall

---

## 1. تطبيق ملف الترحيل والسياسات الأمنية (SQL Migration + RLS)

نفّذ ملفات الترحيل بالترتيب داخل **Supabase SQL Editor** أو عبر `psql`:

1. `CrossCall/database/migrations/001_initial_schema.sql`
2. `CrossCall/database/migrations/002_supabase_auth_and_identities.sql`

يوفّر الملف `002_supabase_auth_and_identities.sql`:
- ربط جدول `users` بمعرّف المستخدم الدائم في `auth.users(id)`.
- جدول `user_identities` لربط مزودات Google / Apple / Email / Phone بحساب واحد.
- Trigger تلقائي `handle_new_auth_user()` لإنشاء ملف المستخدم وإعداداته فور أول تسجيل دخول.
- Trigger `prevent_unlink_last_identity()` لمنع فك ربط آخر وسيلة دخول متبقية.
- سياسات **Row Level Security (RLS)** الكاملة.

---

## 2. تفعيل المزودات في Supabase Dashboard

انتقل إلى **Authentication → Providers**:

1. **Google**:
   - فعّل Google.
   - أدخل `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET`.
   - انسخ عنوان الرد المعروض (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`) وأضفه في Google Cloud Console.
2. **Apple**:
   - فعّل Apple.
   - أدخل `Services ID`, `Team ID`, `Key ID`, و`Secret Key (.p8)` الناتج.
   - أضف عنوان الرد المعروض في Apple Developer → Services ID.
3. **URL Configuration (Authentication → URL Configuration)**:
   - أضف في **Redirect URLs**:
     - `app.crosscall://auth/callback`
     - `https://ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app/auth/callback`
     - `https://ais-pre-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app/auth/callback`
     - `http://localhost:3000/auth/callback`
4. **Manual Linking**:
   - في **Authentication → Settings**, فعّل **Allow manual identity linking** حتى يتمكن المستخدم المسجّل من ربط Google وApple من شاشة الملف الشخصي دون دمج عشوائي بالبريد الإلكتروني.

---

## 3. تشغيل تطبيق Flutter بمتغيرات البيئة عبر `--dart-define`

```bash
flutter run \
  --dart-define=APP_ENV=development \
  --dart-define=APP_URL=https://ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app \
  --dart-define=API_URL=https://ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY \
  --dart-define=GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID \
  --dart-define=GOOGLE_IOS_CLIENT_ID=YOUR_GOOGLE_IOS_CLIENT_ID \
  --dart-define=APPLE_CLIENT_ID=app.crosscall.web
```

> ⚠️ لا تمرر `SUPABASE_SERVICE_ROLE_KEY` أو `GOOGLE_CLIENT_SECRET` أو مفتاح Apple `.p8` إلى `--dart-define` أبداً؛ هذه المفاتيح مخصصة لبيئة الخادم فقط.

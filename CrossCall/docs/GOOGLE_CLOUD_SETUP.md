# دليل إعداد Google Cloud Console لمشروع CrossCall

يتطلب تسجيل الدخول الحقيقي عبر **Google OAuth 2.0 + OpenID Connect + PKCE** إعداد بيانات الاعتماد التالية من لوحة تحكم Google Cloud.

---

## 1. إنشاء المشروع وشاشة الموافقة (OAuth Consent Screen)

1. افتح [Google Cloud Console](https://console.cloud.google.com/).
2. أنشئ مشروعاً جديداً باسم **CrossCall** أو اختر المشروع الحالي.
3. انتقل إلى **APIs & Services → OAuth consent screen**:
   - اختر **External**.
   - أدخل اسم التطبيق: **CrossCall**.
   - أدخل بريد الدعم الفني وبريد المطور.
   - أضف النطاقات المصرّح بها (**Authorized domains**): نطاقك الإنتاجي ونطاق المعاينة السحابية.
4. أضف النطاقات المطلوبة (**Scopes**):
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

---

## 2. إنشاء معرف عميل الويب والخادم (Web Application Client ID)

1. انتقل إلى **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. اختر نوع التطبيق: **Web application**.
3. أضف **Authorized JavaScript origins**:
   - `https://ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app`
   - `https://ais-pre-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app`
   - `http://localhost:3000`
   - نطاق الإنتاج الخاص بك (مثل `https://crosscall.app`)
4. أضف **Authorized redirect URIs**:
   - `https://ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app/auth/callback`
   - `https://ais-pre-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app/auth/callback`
   - `http://localhost:3000/auth/callback`
   - وإذا استخدمت Supabase Auth: `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`
5. احفظ القيم:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET` (يُحفظ في الخادم / بيئة التشغيل فقط ولا يُوضع في كود Flutter أو المتصفح أبداً).

---

## 3. إنشاء عميل Android (Android OAuth Client ID)

1. اختر **Create Credentials → OAuth client ID → Android**.
2. أدخل اسم الحزمة (**Package name**): `app.crosscall.mobile` (مطابق لـ `AndroidManifest.xml`).
3. استخرج بصمة SHA-1:
   ```bash
   # بصمة التطوير Debug SHA-1
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```
   وبصمة الإصدار من **Google Play App Signing** عند النشر.
4. استخدم `GOOGLE_CLIENT_ID` (Web Client ID) كقيمة `serverClientId` في `google_sign_in` حتى يصدر رمز `id_token` صالح للتحقق على الخادم.

---

## 4. إنشاء عميل iOS (iOS OAuth Client ID)

1. اختر **Create Credentials → OAuth client ID → iOS**.
2. أدخل **Bundle ID**: `app.crosscall.mobile`.
3. انسخ **Client ID** وضعه في `--dart-define=GOOGLE_IOS_CLIENT_ID=...`.
4. انسخ **iOS URL scheme** (بصيغة `com.googleusercontent.apps.XXXX`) وضعه داخل `CrossCall/apps/mobile/ios/Runner/Info.plist` تحت `CFBundleURLSchemes`.

# دليل إعداد Apple Developer لميزة Sign in with Apple في CrossCall

يتطلب **Sign in with Apple** إعداد معرّفات وتوقيعات حقيقية من حساب [Apple Developer](https://developer.apple.com/account/).

---

## 1. إعداد App ID (لتطبيق iOS الأصلي)

1. ادخل إلى **Certificates, Identifiers & Profiles → Identifiers → +**.
2. اختر **App IDs → App**.
3. عيّن **Bundle ID** صريحاً (Explicit)، مثال: `app.crosscall.mobile`.
4. فعّل خاصية **Sign in with Apple** ثم اضغط **Edit** وتأكد من اختيار **Enable as a primary App ID**.
5. تأكد من مطابقة ملف `CrossCall/apps/mobile/ios/Runner/Runner.entitlements`:
   - `com.apple.developer.applesignin` = `["Default"]`

---

## 2. إعداد Services ID (لتسجيل الدخول عبر الويب وAndroid)

1. في **Identifiers → +** اختر **Services IDs**.
2. عيّن **Identifier** (وهو قيمة `APPLE_CLIENT_ID` للويب وAndroid)، مثال: `app.crosscall.web`.
3. فعّل **Sign in with Apple** ثم اضغط **Configure**:
   - اختر **Primary App ID**: `app.crosscall.mobile`.
   - أضف **Domains and Subdomains**:
     - `ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app`
     - `ais-pre-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app`
     - `crosscall.app`
   - أضف **Return URLs**:
     - `https://ais-dev-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app/auth/callback`
     - `https://ais-pre-cl6kvzm3ad4nv3mkehinhm-161301854067.europe-west2.run.app/auth/callback`
     - وإذا استخدمت Supabase Auth: `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

---

## 3. إنشاء Sign in with Apple Private Key (.p8)

1. انتقل إلى **Keys → +**.
2. اكتب اسماً للمفتاح (مثل `CrossCall Apple Auth Key`) وفعّل **Sign in with Apple → Configure** واربطه بـ Primary App ID.
3. بعد الإنشاء، حمّل ملف `.p8` فوراً (تسمح Apple بتحميله مرة واحدة فقط!).
4. سجّل القيم التالية لاستخدامها في متغيرات البيئة على الخادم فقط:
   - `APPLE_TEAM_ID`: معرف الفريق المكون من 10 أحرف من صفحة Membership.
   - `APPLE_KEY_ID`: معرف المفتاح المكون من 10 أحرف.
   - `APPLE_CLIENT_ID`: قيمة Services ID (`app.crosscall.web`).
   - `APPLE_PRIVATE_KEY` أو `APPLE_PRIVATE_KEY_PATH`: محتوى أو مسار ملف `.p8`.

> ⚠️ لا تضع مفتاح `.p8` داخل تطبيق Flutter أو Git أبداً.

---

## 4. التعامل مع بيانات Apple الخاصة (Hide My Email & One-Time Name)

- **الاسم الكامل (`user.name`)**: ترسل Apple الاسم الأول واسم العائلة **مرة واحدة فقط** عند أول تفويض للمستخدم. يلتقط خادم `CrossCall` (`server.ts`) وحساب Flutter (`auth_service.dart`) هذا الاسم ويخزنانه فوراً في ملف المستخدم.
- **Hide My Email (`@privaterelay.appleid.com`)**: يحفظ CrossCall معرّف Apple الثابت (`sub`) في جدول `user_identities` ويعلم الحقل `is_private_relay = true` حتى يظل الحساب ثابتاً حتى إذا أخفى المستخدم بريده الحقيقي.
- **إعداد البريد الصادر (Sign in with Apple Email Relay)**: إذا أرسلت بريداً إلى عناوين `@privaterelay.appleid.com`، سجّل نطاق الإرسال ومفاتيح SPF/DKIM في Apple Developer تحت **More → Sign in with Apple for Email Communication**.

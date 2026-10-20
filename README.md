# Omad Bozor — Telegram Mini App

## Ishga tushirish
1. @BotFather: bot yarating → BOT_TOKEN. /mybots → Payments → Click yoki Payme ulang → PAY_TOKEN (UZS).
2. Serverga HTTPS domen ulang (VPS + Caddy/nginx; Mini App va webhook uchun majburiy).
3. `cp .env.example .env`, toʻldiring. `npm install && export $(grep -v '^#' .env | cut -d' ' -f1 | xargs) && npm start`
   (yoki pm2/systemd bilan; env oʻzgaruvchilarni servisga bering).
4. BotFather → /setmenubutton yoki /newapp orqali WEBAPP_URL ni Mini App sifatida ulang.
5. Botga /start yozing. ADMIN_IDS dagi akkauntda ilovada "➕ Auksion / ➕ Lotereya" tugmalari chiqadi.

## Qanday ishlaydi
- Foydalanuvchi initData HMAC orqali tekshiriladi (soxta soʻrov oʻtmaydi).
- Balans, stavka, chipta — SQLite tranzaksiyalarida (ikki marta yechilish/band joy yoʻq).
- Toʻldirish: Telegram Payments (Click/Payme) → webhook → balansga yoziladi (charge_id boʻyicha takrorlanmaydi).
- Lotereya: oxirgi chipta sotilganda `crypto.randomInt` bilan gʻolib tanlanadi; gʻolibga va adminga xabar ketadi.
- Auksion: har stavka 1 000 soʻm, narx +100, taymer 15s. Tugaganda gʻolib narxni balansdan toʻlaydi; yetmasa admin xabar oladi.
- Narxlar `server.js` boshidagi BID/STEP/SEC da.

## Ishga tushirishdan oldin
- Qonuniy: pullik stavka/chipta litsenziya talab qilishi mumkin — yurist bilan tekshiring. Qoidalar sahifasi va yosh cheklovi (18+) qoʻshing.
- Zaxira: data.db ni muntazam nusxalang. Gʻolib tanlash/auksion tarixini ochiq koʻrsatish ishonchni oshiradi.

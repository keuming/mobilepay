import axios from 'axios'

/**
 * Client API dédié à mobilepay-v2-api (le backend ORZAYAH réel — Reloadly,
 * HUB2, catalogue opérateurs), distinct du petit serveur local du site
 * vitrine (`server/`, sa propre base et son propre JWT `mp_token`).
 *
 * § Volontairement séparé de `lib/api.ts` : celui-ci envoie des identifiants
 * (`withCredentials`, jeton `mp_token`) destinés au serveur du site. Le
 * flux "QR Lite" est un endpoint PUBLIC, sans compte — mélanger les deux
 * clients enverrait des en-têtes inutiles vers une API qui n'en attend pas,
 * ou pire, casserait le CORS `credentials: true` de mobilepay-v2-api dont
 * la liste blanche d'origines ne prévoit pas ce cas.
 */
const liteApi = axios.create({
  baseURL: import.meta.env.VITE_LITE_API_URL ?? 'https://mobilepay-v2-api.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
})

export default liteApi

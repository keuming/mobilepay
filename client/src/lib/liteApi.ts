import axios from 'axios'

/**
 * Client API dedie a mobilepay-v2-api (le backend ORZAYAH reel - Reloadly,
 * HUB2, catalogue operateurs), distinct du petit serveur local du site
 * vitrine (`server/`, sa propre base et son propre JWT `mp_token`).
 */
const liteApi = axios.create({
  baseURL: import.meta.env.VITE_LITE_API_URL ?? 'https://mobilepay-v2-api.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
})

// mobilepay-v2-api enveloppe TOUTES ses reponses dans { success, data }.
// Sans cette extraction, chaque appel recevait l'enveloppe entiere au lieu
// de son contenu - la liste d'operateurs devenait un objet sur lequel
// .map() echoue, d'ou la page blanche.
liteApi.interceptors.response.use((res) => {
  if (res.data && typeof res.data === 'object' && 'data' in res.data) {
    res.data = res.data.data
  }
  return res
})

export default liteApi
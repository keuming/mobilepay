import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Smartphone, Sparkles } from 'lucide-react'

export default function LiteMerci() {
  const [params] = useSearchParams()
  const statut = params.get('statut')
  const [confirmed, setConfirmed] = useState<'SUCCESS' | 'FAILED' | 'PENDING' | null>(null)

  const transactionId = params.get('id')

  useEffect(() => {
    if (!transactionId) return
    fetch(`https://mobilepay-v2-api.onrender.com/api/airtime-lite/${transactionId}/status`)
      .then((r) => r.json())
      .then((tx) => setConfirmed(tx.status === 'SUCCESS' ? 'SUCCESS' : tx.status === 'FAILED' ? 'FAILED' : 'PENDING'))
      .catch(() => setConfirmed(statut === 'succes' ? 'SUCCESS' : 'FAILED'))
  }, [transactionId, statut])

  const success = confirmed === 'SUCCESS' || (confirmed === null && statut === 'succes')

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-6">
        {success ? (
          <CheckCircle2 className="h-20 w-20 text-primary-400" />
        ) : (
          <XCircle className="h-20 w-20 text-red-400" />
        )}
      </div>

      <h1 className="text-2xl font-bold mb-2">
        {success ? 'Paiement confirmé !' : "Le paiement n'a pas abouti"}
      </h1>
      <p className="text-white/60 max-w-sm mb-10">
        {success
          ? 'Ton crédit ou forfait data arrive dans quelques instants sur le numéro indiqué.'
          : "Vérifie ton solde Mobile Money et réessaie depuis le lien reçu par SMS."}
      </p>

      <div className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-primary-400/15 to-primary-400/5 border border-primary-400/30 p-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="text-primary-400" size={18} />
          <span className="text-xs font-bold uppercase tracking-wider text-primary-400">
            Va plus loin avec ORZAYAH
          </span>
        </div>
        <p className="text-sm text-white/70 mb-5">
          Wallet, transferts, factures, cartes cadeaux et bien plus — installe
          l'application et gère tout depuis un seul endroit, sans jamais ressaisir
          tes informations.
        </p>
        
        <a
          href="/"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-400 text-black font-bold py-3.5"
        >
          <Smartphone size={18} />
          Découvrir l'application
        </a>
      </div>

      <a href="/lite" className="text-white/40 text-sm mt-8 underline">
        Faire un nouvel achat sans compte
      </a>
    </div>
  )
}

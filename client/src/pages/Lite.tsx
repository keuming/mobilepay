import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Loader2, Smartphone, Wifi } from 'lucide-react'
import liteApi from '../lib/liteApi'
import { HUB2_COUNTRIES } from '../lib/hub2Countries'
import { WORLD_COUNTRIES } from '../lib/worldCountries'

/**
 * Parcours "QR Lite" : achat de crédit de communication ou de forfait data
 * DEPUIS le site vitrine, SANS créer de compte ORZAYAH. Accessible en
 * scannant un QR code affiché sur le site ou ailleurs.
 *
 * § Le paiement se fait exclusivement en Mobile Money via HUB2 — la liste
 * de pays proposée est donc celle couverte par HUB2 (zones UEMOA/CEMAC),
 * pas les 190+ pays que Reloadly sait livrer : proposer un pays où le
 * paiement échouerait n'aurait aucun sens ici.
 */

interface Operator {
  operatorId: string
  name: string
  logoUrls?: string[]
}

type Category = 'AIRTIME' | 'DATA'
type MomoProvider = 'ORANGE' | 'MTN' | 'MOOV' | 'WAVE'

const CATEGORIES: { id: Category; label: string; icon: typeof Smartphone; hint: string }[] = [
  { id: 'AIRTIME', label: 'Crédit de communication', icon: Smartphone, hint: 'Recharge classique' },
  { id: 'DATA', label: 'Forfait internet', icon: Wifi, hint: 'Pass data' },
]

const MOMO_PROVIDERS: { id: MomoProvider; label: string }[] = [
  { id: 'ORANGE', label: 'Orange Money' },
  { id: 'MTN', label: 'MTN MoMo' },
  { id: 'MOOV', label: 'Moov Money' },
  { id: 'WAVE', label: 'Wave' },
]

const STEPS = ['Pays', 'Catégorie', 'Opérateur', 'Numéro', 'Montant', 'Paiement'] as const

type NextAction = { type: string; message?: string; url?: string } | null

export default function Lite() {
  const [step, setStep] = useState(0)
  const [recipientCountry, setRecipientCountry] = useState('')
  const [payerCountry, setPayerCountry] = useState('')

  // Si le bénéficiaire est dans un pays couvert par HUB2, on le
  // pré-sélectionne pour le payeur — cas le plus fréquent (achat pour
  // soi-même). Reste modifiable à l'étape du paiement.
  useEffect(() => {
    if (!payerCountry && HUB2_COUNTRIES.some((c) => c.code === recipientCountry)) {
      setPayerCountry(recipientCountry)
    }
  }, [recipientCountry, payerCountry])
  const [category, setCategory] = useState<Category | null>(null)
  const [operators, setOperators] = useState<Operator[]>([])
  const [loadingOperators, setLoadingOperators] = useState(false)
  const [operator, setOperator] = useState<Operator | null>(null)
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [momoProvider, setMomoProvider] = useState<MomoProvider | null>(null)
  const [payerPhone, setPayerPhone] = useState('')
  const [upfrontOtp, setUpfrontOtp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextAction, setNextAction] = useState<NextAction>(null)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [finalStatus, setFinalStatus] = useState<'SUCCESS' | 'FAILED' | null>(null)

  useEffect(() => {
    if (step !== 2 || !recipientCountry) return
    setLoadingOperators(true)
    setError(null)
    liteApi
      .get<Operator[]>(`/airtime-lite/operators?country=${recipientCountry}`)
      .then((res) => setOperators(res.data))
      .catch(() => setError('Aucun opérateur disponible pour ce pays pour le moment.'))
      .finally(() => setLoadingOperators(false))
  }, [step, recipientCountry])

  // Sondage du statut après paiement — le circuit HUB2 est asynchrone.
  useEffect(() => {
    if (!transactionId || finalStatus) return
    const interval = setInterval(async () => {
      try {
        const res = await liteApi.get(`/transactions/${transactionId}`)
        const tx = res.data
        if (tx.status === 'SUCCESS') {
          setFinalStatus('SUCCESS')
          clearInterval(interval)
        } else if (tx.status === 'FAILED') {
          setFinalStatus('FAILED')
          setError(tx.failureReason ?? "Le paiement n'a pas abouti.")
          clearInterval(interval)
        } else if (tx.nextActionType && tx.nextActionType !== nextAction?.type) {
          setNextAction({ type: tx.nextActionType, message: tx.nextActionMessage, url: tx.nextActionUrl })
        }
      } catch {
        // Erreur réseau ponctuelle — le prochain passage réessaiera.
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [transactionId, finalStatus, nextAction])

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return !!recipientCountry
      case 1:
        return category !== null
      case 2:
        return operator !== null
      case 3:
        return phone.replace(/\D/g, '').length >= 8
      case 4:
        return !!amount && Number(amount) > 0
      case 5:
        return (
          momoProvider !== null &&
          !!payerCountry &&
          payerPhone.replace(/\D/g, '').length >= 8 &&
          (momoProvider !== 'ORANGE' || upfrontOtp.length >= 4)
        )
      default:
        return false
    }
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await liteApi.post('/airtime-lite', {
        phoneNumber: phone,
        amount: Math.round(Number(amount) * 100),
        kind: category,
        operatorId: operator?.operatorId,
        momoProvider,
        payerPhone,
        recipientCountry,
        payerCountry,
        ...(momoProvider === 'ORANGE' && upfrontOtp ? { otpCode: upfrontOtp } : {}),
      })
      setTransactionId(res.data.id)
      if (res.data.nextActionType) {
        setNextAction({
          type: res.data.nextActionType,
          message: res.data.nextActionMessage,
          url: res.data.nextActionUrl,
        })
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Le paiement n'a pas pu démarrer.")
    } finally {
      setSubmitting(false)
    }
  }

  const goNext = () => {
    if (step === STEPS.length - 1) submit()
    else setStep((s) => s + 1)
  }

  // --- Écran de résultat final ---
  if (finalStatus === 'SUCCESS') {
    return (
      <ResultScreen
        icon={<CheckCircle2 className="h-16 w-16 text-primary-400" />}
        title="C'est fait !"
        message={`${Number(amount).toLocaleString('fr-FR')} FCFA de ${category === 'DATA' ? 'forfait data' : 'crédit'} envoyés au ${phone}.`}
      />
    )
  }
  if (finalStatus === 'FAILED') {
    return (
      <ResultScreen
        icon={<span className="text-5xl">⚠️</span>}
        title="Ça n'a pas fonctionné"
        message={error ?? "Le paiement n'a pas pu être confirmé."}
        retry
      />
    )
  }

  // --- Écran d'action requise (attente du paiement) ---
  if (transactionId && nextAction) {
    return <PendingScreen nextAction={nextAction} amount={amount} />
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="p-2 -ml-2 rounded-full hover:bg-white/5">
              <ArrowLeft size={20} />
            </button>
          )}
          <img src="/brand/orzayah-logo.png" alt="ORZAYAH" className="h-6 w-auto" />
          <span className="text-white/40 text-sm ml-auto">
            Étape {step + 1}/{STEPS.length}
          </span>
        </div>

        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary-400' : 'bg-white/10'}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              <div>
                <h1 className="text-xl font-bold mb-1">Pour quel pays ?</h1>
                <p className="text-white/50 text-sm mb-5">
                  Le pays du numéro à recharger — Reloadly couvre le monde entier.
                </p>
                <select
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5 text-white focus:border-primary-400 outline-none appearance-none"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23ffffff80'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                  }}
                >
                  <option value="" disabled className="bg-[#0B0F1A]">
                    Sélectionne un pays…
                  </option>
                  {WORLD_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#0B0F1A]">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {step === 1 && (
              <div>
                <h1 className="text-xl font-bold mb-5">Que veux-tu acheter ?</h1>
                <div className="space-y-3">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      className={`w-full flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-colors ${
                        category === c.id
                          ? 'border-primary-400 bg-primary-400/10'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <c.icon size={22} className="text-primary-400 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">{c.label}</div>
                        <div className="text-xs text-white/40">{c.hint}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h1 className="text-xl font-bold mb-5">Chez quel opérateur ?</h1>
                {loadingOperators ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-primary-400" size={28} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {operators.map((o) => (
                      <button
                        key={o.operatorId}
                        onClick={() => setOperator(o)}
                        className={`w-full flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-colors ${
                          operator?.operatorId === o.operatorId
                            ? 'border-primary-400 bg-primary-400/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        {o.logoUrls?.[2] || o.logoUrls?.[0] ? (
                          <img
                            src={o.logoUrls[2] ?? o.logoUrls[0]}
                            alt=""
                            className="h-9 w-9 rounded-lg bg-white object-contain"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-white/10" />
                        )}
                        <span className="font-semibold">{o.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div>
                <h1 className="text-xl font-bold mb-1">Quel numéro ?</h1>
                <p className="text-white/50 text-sm mb-5">Le numéro qui recevra le crédit.</p>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="0700000000"
                  inputMode="numeric"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5 text-lg tracking-wide focus:border-primary-400 outline-none"
                />
              </div>
            )}

            {step === 4 && (
              <div>
                <h1 className="text-xl font-bold mb-5">Quel montant ?</h1>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  inputMode="numeric"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5 text-2xl font-bold focus:border-primary-400 outline-none"
                />
                <span className="text-white/40 text-sm mt-2 block">FCFA</span>
              </div>
            )}

            {step === 5 && (
              <div>
                <h1 className="text-xl font-bold mb-1">Comment payer ?</h1>
                <p className="text-white/50 text-sm mb-5">
                  Tu vas recevoir une demande de confirmation sur ton téléphone.
                </p>

                {/* § Pays du PAYEUR — distinct du pays du bénéficiaire choisi
                    à l'étape 1 : on peut très bien payer depuis la Côte
                    d'Ivoire pour recharger un proche au Sénégal ou ailleurs.
                    Limité aux pays que HUB2 sait collecter (Mobile Money
                    UEMOA/CEMAC) — proposer un pays hors de cette liste ferait
                    échouer le paiement après coup. */}
                <label className="text-xs text-white/50 mb-1.5 block">
                  Pays de ton compte Mobile Money
                </label>
                <select
                  value={payerCountry}
                  onChange={(e) => setPayerCountry(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5 text-white mb-4 focus:border-primary-400 outline-none appearance-none"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23ffffff80'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                  }}
                >
                  <option value="" disabled className="bg-[#0B0F1A]">
                    Sélectionne un pays…
                  </option>
                  {HUB2_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#0B0F1A]">
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2 mb-5">
                  {MOMO_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setMomoProvider(p.id)}
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                        momoProvider === p.id
                          ? 'border-primary-400 bg-primary-400/10'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  value={payerPhone}
                  onChange={(e) => setPayerPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ton numéro Mobile Money"
                  inputMode="numeric"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5 focus:border-primary-400 outline-none"
                />

                {/* § Orange exige son code AVANT le paiement (voir
                    commentaire backend) — sans ça, le délai de 10 minutes
                    d'Orange s'épuise et le paiement expire systématiquement.
                    Les autres opérateurs authentifient directement sur le
                    téléphone, aucune saisie supplémentaire n'est nécessaire. */}
                {momoProvider === 'ORANGE' && (
                  <div className="mt-4">
                    <div className="rounded-xl bg-primary-400/10 border border-primary-400/30 p-4 mb-3">
                      <p className="text-sm font-semibold mb-1">1️⃣ Génère ton code Orange Money</p>
                      <p className="text-white/60 text-xs mb-2">
                        Depuis ton téléphone Orange, compose :
                      </p>
                      <p className="text-2xl font-bold text-primary-400 text-center tracking-wider mb-2">
                        #144*82#
                      </p>
                      <p className="text-white/60 text-xs">
                        puis choisis l'option pour obtenir ton code de paiement.
                      </p>
                    </div>
                    <label className="text-xs text-white/50 mb-1.5 block">
                      2️⃣ Code de paiement Orange Money
                    </label>
                    <input
                      value={upfrontOtp}
                      onChange={(e) => setUpfrontOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      inputMode="numeric"
                      className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5 text-center text-xl tracking-widest focus:border-primary-400 outline-none"
                    />
                  </div>
                )}

                <div className="mt-5 rounded-xl bg-white/[0.02] border border-white/10 p-4 text-sm space-y-2">
                  <Row k="Numéro crédité" v={phone} />
                  <Row k="Montant" v={`${Number(amount).toLocaleString('fr-FR')} FCFA`} />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <button
          onClick={goNext}
          disabled={!canNext() || submitting}
          className="w-full mt-8 rounded-xl bg-primary-400 text-black font-bold py-3.5 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={20} />
          ) : step === STEPS.length - 1 ? (
            'Confirmer le paiement'
          ) : (
            'Continuer'
          )}
        </button>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/50">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  )
}

function ResultScreen({
  icon,
  title,
  message,
  retry,
}: {
  icon: React.ReactNode
  title: string
  message: string
  retry?: boolean
}) {
  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-5">{icon}</div>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-white/60 max-w-xs mb-8">{message}</p>
      {retry && (
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary-400 text-black font-bold px-8 py-3"
        >
          Réessayer
        </button>
      )}
    </div>
  )
}

function PendingScreen({ nextAction, amount }: { nextAction: NextAction; amount: string }) {
  if (!nextAction) return null
  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white flex flex-col items-center justify-center px-6 text-center">
      <Loader2 className="animate-spin text-primary-400 mb-5" size={40} />
      {/* § Depuis que le code Orange est demandé EN AMONT (étape précédente),
          HUB2 ne renvoie plus jamais nextActionType "otp" ici — le paiement
          part déjà authentifié. Seuls deux cas restent possibles : Wave
          (lien à ouvrir) et MTN/Moov/Orange (validation déjà lancée côté
          opérateur, on attend juste la confirmation). */}
      <h1 className="text-xl font-bold mb-2">
        {nextAction.type === 'redirection' ? 'Ouvre le lien de paiement' : 'Confirmation en cours'}
      </h1>
      <p className="text-white/60 max-w-xs mb-6">
        {nextAction.message ??
          `Confirme le paiement de ${Number(amount).toLocaleString('fr-FR')} FCFA sur ton téléphone.`}
      </p>
      {nextAction.type === 'redirection' && nextAction.url && (
        <a
          href={nextAction.url}
          className="rounded-xl bg-primary-400 text-black font-bold px-8 py-3 inline-block"
        >
          Ouvrir le lien
        </a>
      )}
    </div>
  )
}

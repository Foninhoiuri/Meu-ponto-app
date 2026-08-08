import { type ButtonHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  status: 'OPEN' | 'WORKING' | 'LUNCH' | 'CLOSED' | 'PLANTAO_OPEN' | 'PLANTAO_WORKING';
  /** Incrementa a cada registro bem-sucedido para disparar a animação interna. */
  fxKey?: number;
}

// Base glass compartilhada com o botão de plantão (mesma família visual)
export const glassActionBase =
  'relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.06] backdrop-blur-xl ' +
  'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)] transition-all duration-300 ' +
  'active:scale-[0.985] disabled:cursor-not-allowed';

export const BigPunchButton = ({ status, fxKey = 0, className, ...props }: Props) => {
  const getButtonState = () => {
    switch (status) {
      case 'OPEN':
        return { label: 'Registrar Entrada', accent: 'text-primary', glow: 'from-primary/25', pulse: true };
      case 'WORKING':
        return { label: 'Finalizar Expediente', accent: 'text-danger', glow: 'from-danger/20', pulse: false };
      case 'LUNCH':
        return { label: 'Voltar do Almoço', accent: 'text-success', glow: 'from-success/20', pulse: true };
      case 'CLOSED':
        return { label: 'Expediente Finalizado', accent: 'text-textSecondary', glow: 'from-white/5', pulse: false };
      case 'PLANTAO_OPEN':
        return { label: 'Iniciar Saída', accent: 'text-primary', glow: 'from-primary/25', pulse: true };
      case 'PLANTAO_WORKING':
        return { label: 'Finalizar Saída', accent: 'text-danger', glow: 'from-danger/20', pulse: false };
      default:
        return { label: '', accent: '', glow: '', pulse: false };
    }
  };

  const state = getButtonState();

  return (
    <button
      disabled={status === 'CLOSED'}
      className={twMerge(
        clsx(
          glassActionBase,
          'w-full h-full flex items-center justify-center p-6',
          'text-2xl sm:text-3xl font-semibold text-center leading-tight',
          state.accent,
          status === 'CLOSED' && 'opacity-60'
        ),
        className
      )}
      {...props}
    >
      {/* Glow interno sutil por status */}
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent opacity-70',
          state.glow,
          state.pulse && 'animate-pulse'
        )}
      />
      {/* Brilho superior estilo vidro */}
      <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <span className="relative z-10">{state.label}</span>

      {/* Animação de sucesso: onda + check */}
      {fxKey > 0 && (
        <span key={fxKey} aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="punch-ripple absolute h-40 w-40 rounded-full bg-current opacity-20" />
          <span className="punch-check flex h-16 w-16 items-center justify-center rounded-full bg-current/20 backdrop-blur-sm">
            <Check size={34} strokeWidth={3} className="text-white" />
          </span>
        </span>
      )}
    </button>
  );
};

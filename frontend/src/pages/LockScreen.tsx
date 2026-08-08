import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  onLogin: () => void;
}

const LockScreen = ({ onLogin }: Props) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const verifyPin = (currentPin: string) => {
    // Para simplificar, assumimos um PIN mockado 1234
    // Em produção, isso bateria com o backend ou cache criptografado
    if (currentPin === '1234') {
      localStorage.setItem('auth_pin', 'true');
      onLogin();
      navigate('/', { replace: true });
    } else {
      setError(true);
      setTimeout(() => {
        setPin('');
        setError(false);
      }, 500);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-white p-6">
      <div className="mb-12 text-center">
        <h1 className="text-2xl font-semibold mb-2">Meu Ponto</h1>
        <p className="text-textSecondary">Digite seu PIN</p>
      </div>

      {/* Dots */}
      <div className={`flex gap-4 mb-16 ${error ? 'animate-bounce' : ''}`}>
        {[0, 1, 2, 3].map((index) => (
          <div 
            key={index}
            className={`w-4 h-4 rounded-full border border-white/30 transition-colors ${
              index < pin.length ? 'bg-primary border-primary' : 'bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-6 max-w-xs">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigit(digit.toString())}
            className="w-16 h-16 rounded-full glass flex items-center justify-center text-2xl active:scale-95 transition-transform"
          >
            {digit}
          </button>
        ))}
        <div className="w-16 h-16" /> {/* Espaço vazio */}
        <button
          onClick={() => handleDigit('0')}
          className="w-16 h-16 rounded-full glass flex items-center justify-center text-2xl active:scale-95 transition-transform"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl text-textSecondary active:scale-95 transition-transform"
        >
          ⌫
        </button>
      </div>
    </div>
  );
};

export default LockScreen;

import 'dotenv/config';
import { conferirAmbiente } from './middlewares/security';
import { initVapid } from './services/notifyService';

conferirAmbiente();
initVapid();

import app from './app';

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Swagger documentation at http://localhost:${PORT}/api-docs`);
});

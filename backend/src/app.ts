import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';
import routes from './routes';
import { securityHeaders, globalRateLimit, errorHandler, notFoundHandler } from './middlewares/security';

const app = express();

app.use(securityHeaders);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' && process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',') : '*',
}));
app.use(globalRateLimit);
app.use(express.json());

app.use('/api', routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

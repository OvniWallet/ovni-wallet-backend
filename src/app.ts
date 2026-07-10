import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './modules/auth/auth.routes';
import exchangeRoutes from './modules/exchange/exchange.routes';
import virtualCardsRoutes from './modules/virtual-cards/virtual-cards.routes';

const app = express();

// 🛡️ Middlewares de seguridad y optimización (Lo que hizo tu compañero)
app.use(helmet()); // Protege la app configurando varios headers HTTP
app.use(cors());   // Permite que el frontend (React) se conecte al backend
app.use(express.json()); // Parsea los bodies en formato JSON
app.use(morgan('dev'));  // Muestra logs de las peticiones en la consola en desarrollo

// 🟢 Endpoint de control de salud (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// 🚀 Registro de rutas modulares (Lo que agregamos nosotros)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/exchange', exchangeRoutes);
app.use('/api/v1/virtual-cards', virtualCardsRoutes);

// 🚨 Middleware global de manejo de errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  
  res.status(statusCode).json({
    status: 'error',
    code,
    message: err.message || 'Ocurrió un error inesperado en el servidor',
  });
});

export default app;
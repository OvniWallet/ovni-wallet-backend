import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// 🔑 Importaciones de tus módulos (Fases 1, 2 y 3)
import authRoutes from './modules/auth/auth.routes';
import walletsRoutes from './modules/wallets/wallets.routes';
import transactionsRoutes from './modules/transactions/transactions.routes';
import p2pRoutes from './modules/p2p/p2p.routes';

// 📈 Importaciones de los módulos de tu compañero (Fases 4 y 5)
import exchangeRoutes from './modules/exchange/exchange.routes';
import virtualCardsRoutes from './modules/virtual-cards/virtual-cards.routes';

const app = express();

// 🛡️ Middlewares de seguridad y optimización
app.use(helmet()); 
app.use(cors());   
app.use(express.json()); 
app.use(morgan('dev'));  

// 🟢 Endpoint de control de salud (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// 🚀 Registro de TODAS las rutas modulares unificadas
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/wallets', walletsRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/p2p', p2pRoutes);
app.use('/api/v1/exchange', exchangeRoutes);       // 👈 Agregado de tu compañero
app.use('/api/v1/virtual-cards', virtualCardsRoutes); // 👈 Agregado de tu compañero

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
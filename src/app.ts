import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';


import authRoutes from './modules/auth/auth.routes';
import walletsRoutes from './modules/wallets/wallets.routes';
import transactionsRoutes from './modules/transactions/transactions.routes';
import p2pRoutes from './modules/p2p/p2p.routes';


import exchangeRoutes from './modules/exchange/exchange.routes';
import virtualCardsRoutes from './modules/virtual-cards/virtual-cards.routes';
import chatbotRoutes from './modules/chatbot/chatbot.routes';

const app = express();

// Railway (y la mayoria de los PaaS) enrutan el trafico a traves de un proxy
// reverso; sin esto, req.ip devuelve la IP interna del proxy para todas las
// requests (rompe el rate-limit por IP) y express-rate-limit rechaza el
// header X-Forwarded-For por no confiar en el proxy.
app.set('trust proxy', 1);

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
app.use('/api/v1/exchange', exchangeRoutes);
app.use('/api/v1/virtual-cards', virtualCardsRoutes);
app.use('/api/v1/chatbot', chatbotRoutes);

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
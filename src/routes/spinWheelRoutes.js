import { Router } from 'express';
import { initializeWheel, joinWheel, startWheelManually } from '../controllers/spinWheelController.js';

const router = Router();

router.post('/initialize', initializeWheel);
router.post('/join', joinWheel);
router.post('/start', startWheelManually);

export default router;

import { Router } from 'express';
import { createUser, getUser, getUserStats, getAdminStats } from '../controllers/userController.js';

const router = Router();

router.post('/', createUser);
router.get('/:id', getUser);
router.get('/:id/stats', getUserStats);
router.get('/admin/:id/stats', getAdminStats);

export default router;

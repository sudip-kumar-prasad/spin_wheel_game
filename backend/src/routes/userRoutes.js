import { Router } from 'express';
import { createUser, getUser, getUserStats, getAdminStats, signupUser, signinUser } from '../controllers/userController.js';

const router = Router();

router.post('/', createUser);
router.post('/signup', signupUser);
router.post('/signin', signinUser);
router.get('/:id', getUser);
router.get('/:id/stats', getUserStats);
router.get('/admin/:id/stats', getAdminStats);

export default router;

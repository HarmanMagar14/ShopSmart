import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { answerQuestion } from '../services/assistant.js';
import { assistantQuestionSchema } from '../validators/schemas.js';
const router = Router();

// The 429 body uses the same JSON error shape as every other route, so the frontend can show it.
const assistantLimiter = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many questions. Please wait a minute and try again.' } }
});

router.post('/questions', assistantLimiter, async (request, response, next) => {
  try {
    const parsed = assistantQuestionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_QUESTION', message: 'Question must contain between 3 and 300 characters.' } });
    // Only public catalog fields are loaded, so nothing else can reach the AI provider.
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, description: true, category: true, price: true, stock: true },
      orderBy: { price: 'asc' }
    });
    response.json(await answerQuestion(products, parsed.data.question));
  } catch (error) { next(error); }
});

export default router;

import jwt from 'jsonwebtoken';
import { hashSync, compareSync, compare } from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'synthmind-default-secret';

export function hashPassword(password) {
  return hashSync(password, 12);
}

export async function verifyPassword(password, hashedPassword) {
  try {
    // Use async compare for better reliability with bcryptjs v3
    const result = await compare(password, hashedPassword);
    return result;
  } catch (err) {
    console.error('bcrypt compare error:', err);
    // Fallback to sync
    try {
      return compareSync(password, hashedPassword);
    } catch (syncErr) {
      console.error('bcrypt compareSync error:', syncErr);
      return false;
    }
  }
}

export function generateToken(userId, email) {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function getTokenFromRequest(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    return cookies['token'] || null;
  }
  
  return null;
}

export function authenticateRequest(request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const {
  signAccessToken,
  signRefreshToken,
} = require('../services/token.service');

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const issueTokens = async (userId) => {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);
  await RefreshToken.create({
    user: userId,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken, refreshToken };
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: 'name, email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'email already registered' });
    }

    const user = await User.create({ name, email, password });
    const tokens = await issueTokens(user._id);

    return res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email },
      ...tokens,
    });
  } catch (err) {
    console.error('register failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');
    const valid = user && (await user.comparePassword(password));
    if (!valid) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const tokens = await issueTokens(user._id);

    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email },
      ...tokens,
    });
  } catch (err) {
    console.error('login failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { register, login };
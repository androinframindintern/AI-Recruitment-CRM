export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

import { createApp } from '../../../server/server.js';

const app = createApp();

export default function handler(req, res) {
  return app(req, res);
}

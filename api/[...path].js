import {createAgentHandler} from '../server/agent.mjs';

// Keep the original streaming body limits rather than having Vercel parse JSON.
export const config = {api: {bodyParser: false}};
const handle = createAgentHandler();
export default function handler(req, res) {
  // Vercel adds the dynamic path as a query parameter to req.url.
  req.url = new URL(req.url, 'http://localhost').pathname;
  return handle(req, res);
}

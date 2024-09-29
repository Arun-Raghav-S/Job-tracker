// middleware.js

import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/', // Redirect to the homepage if not authenticated
  },
});

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};

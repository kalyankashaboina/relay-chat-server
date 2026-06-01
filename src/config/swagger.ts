import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'Relay Chat API',
    version: '1.0.0',
    description: 'REST API for Relay Chat — auth, conversations, messages, users, uploads.',
  },
  servers: [{ url: '/api', description: 'Default' }],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'relay_token' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          avatar: { type: 'string' },
          bio: { type: 'string' },
          isEmailVerified: { type: 'boolean' },
          provider: { type: 'string', enum: ['local', 'google'] },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          conversationId: { type: 'string' },
          senderId: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string', enum: ['text', 'image', 'file', 'system'] },
          createdAt: { type: 'string', format: 'date-time' },
          isDeleted: { type: 'boolean' },
          isEdited: { type: 'boolean' },
        },
      },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['direct', 'group'] },
          name: { type: 'string' },
          participants: { type: 'array', items: { $ref: '#/components/schemas/User' } },
          lastMessage: { $ref: '#/components/schemas/Message' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new user',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'username', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  username: { type: 'string', minLength: 3 },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } },
            },
          },
          409: { description: 'Email/username taken' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email + password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Logged in, cookie set' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout — clears cookie',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        responses: {
          200: { description: 'Current user profile' },
          401: { description: 'Not authenticated' },
        },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Auth'],
        summary: 'Google OAuth login/register',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: { idToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Logged in via Google' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset email',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Reset link sent (if account exists)' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password with token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset' },
          400: { description: 'Invalid/expired token' },
        },
      },
    },
    '/auth/socket-token': {
      get: {
        tags: ['Auth'],
        summary: 'Get short-lived socket handshake token',
        responses: { 200: { description: 'Socket token' } },
      },
    },
    '/conversations': {
      get: {
        tags: ['Conversations'],
        summary: 'Get paginated sidebar conversations',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Conversation list with pagination cursor' } },
      },
      post: {
        tags: ['Conversations'],
        summary: 'Create or get direct conversation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetUserId'],
                properties: { targetUserId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Conversation created or existing returned' } },
      },
    },
    '/conversations/search': {
      get: {
        tags: ['Conversations'],
        summary: 'Search conversations',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Matching conversations' } },
      },
    },
    '/conversations/group': {
      post: {
        tags: ['Conversations'],
        summary: 'Create group conversation (min 3 members)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'memberIds'],
                properties: {
                  name: { type: 'string' },
                  memberIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Group created' },
          400: { description: 'Need at least 3 members' },
        },
      },
    },
    '/conversations/{id}/messages': {
      get: {
        tags: ['Messages'],
        summary: 'Get paginated messages for a conversation',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 40 } },
        ],
        responses: {
          200: { description: 'Messages + cursor' },
          403: { description: 'Not a member' },
        },
      },
    },
    '/messages/scheduled': {
      get: {
        tags: ['Messages'],
        summary: 'List scheduled messages',
        responses: { 200: { description: 'Scheduled messages list' } },
      },
      post: {
        tags: ['Messages'],
        summary: 'Create scheduled message',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['conversationId', 'content', 'scheduledAt'],
                properties: {
                  conversationId: { type: 'string' },
                  content: { type: 'string' },
                  scheduledAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Scheduled message created' } },
      },
    },
    '/messages/search': {
      get: {
        tags: ['Messages'],
        summary: 'Full-text search messages',
        parameters: [
          { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'conversationId', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Search results' } },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'Search/list users (excludes self)',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'User list' } },
      },
    },
    '/users/me': {
      put: {
        tags: ['Users'],
        summary: 'Update own profile',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  avatar: { type: 'string' },
                  bio: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated profile' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete own account',
        responses: { 200: { description: 'Account deleted' } },
      },
    },
    '/upload': {
      post: {
        tags: ['Upload'],
        summary: 'Upload a file (image, video, audio, document)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          201: { description: 'Upload result with URL' },
          400: { description: 'No file or invalid type' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Relay Chat API' }));
  app.get('/docs.json', (_req, res) => res.json(spec));
}

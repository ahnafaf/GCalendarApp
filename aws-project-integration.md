# AWS Architecture and Project Reorganization Integration

This document explains how the proposed project reorganization aligns with and supports the AWS serverless architecture we've planned.

## How the New Structure Supports Serverless Architecture

The reorganized project structure is designed to work seamlessly with the AWS serverless architecture while improving maintainability and clarity:

### 1. API Routes and Lambda Functions

**Project Structure:**
```
src/
└── pages/
    └── api/
        ├── chat.js
        ├── events.js
        └── auth/
            └── [...nextauth].js
```

**AWS Integration:**
- Each API route in `src/pages/api/` maps naturally to an AWS Lambda function
- The reorganization maintains Next.js API routes pattern which works well with services like AWS Amplify or the Serverless Framework
- Clear separation makes it easier to deploy individual functions with appropriate IAM permissions

### 2. Services Layer for AWS Service Integration

**Project Structure:**
```
src/
└── services/
    ├── calendar/
    │   ├── google-calendar.js
    │   └── calendar-actions.js
    ├── chat/
    │   └── chatbot.js
    └── auth/
        └── auth-service.js
```

**AWS Integration:**
- The services directory cleanly encapsulates AWS SDK interactions
- Each service can be adapted to use AWS services:
  - `calendar/` services can integrate with DynamoDB for event storage
  - `chat/` services connect to OpenAI API through Lambda
  - `auth/` services integrate with Cognito

### 3. Database Layer for DynamoDB

**Project Structure:**
```
src/
└── database/
    ├── models/
    │   ├── event.js
    │   └── session.js
    ├── db-client.js
    └── db-setup.js
```

**AWS Integration:**
- The database directory provides a clean abstraction for DynamoDB integration
- Models define the schema for DynamoDB tables
- `db-client.js` can be adapted to use AWS SDK for DynamoDB instead of Sequelize/SQLite
- Clear separation makes it easier to implement DynamoDB Streams for real-time updates

### 4. Middleware for Lambda-Compatible Authentication

**Project Structure:**
```
src/
└── middleware/
    └── auth-middleware.js
```

**AWS Integration:**
- Middleware can be adapted to work with AWS Lambda authorizers
- Authentication can be integrated with Cognito
- Clear separation makes it easier to implement different auth strategies for different environments

### 5. Configuration for Environment-Specific Settings

**Project Structure:**
```
src/
└── config/
    ├── auth-config.js
    └── api-config.js
```

**AWS Integration:**
- Configuration files can include environment-specific settings
- Easy to adapt for different AWS environments (dev, staging, prod)
- Can store AWS service endpoints, region settings, etc.

## Deployment Considerations

### 1. Serverless Framework Configuration

The new structure works well with a `serverless.yml` configuration:

```yaml
service: gcalendar-app

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    # Environment variables

functions:
  # API endpoints as Lambda functions
  nextjs:
    handler: src/serverless.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
  
  # WebSocket handlers
  websocketConnect:
    handler: src/services/websocket/connect.handler
    events:
      - websocket:
          route: $connect
  
  websocketDisconnect:
    handler: src/services/websocket/disconnect.handler
    events:
      - websocket:
          route: $disconnect
  
  # DynamoDB Stream handlers
  notificationHandler:
    handler: src/services/notifications/handler.processEvents
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt EventsTable.StreamArn

resources:
  Resources:
    # DynamoDB tables, Cognito resources, etc.
```

### 2. Next.js Serverless Deployment

The reorganized structure supports Next.js serverless deployment:

- Works with `@sls-next/serverless-component`
- Compatible with AWS Amplify
- Supports Lambda@Edge for CloudFront integration

### 3. Local Development with AWS Emulators

The new structure facilitates local development with AWS emulators:

```
# Start local development with AWS emulators
npm run dev:local
```

This would:
- Start DynamoDB Local
- Run API Gateway emulator
- Set up local WebSocket server
- Configure environment for local development

## Real-Time Updates in the New Structure

The reorganized project better supports real-time updates with AWS:

1. **WebSocket Service:**
   ```
   src/
   └── services/
       └── websocket/
           ├── connect.js
           ├── disconnect.js
           └── message-handler.js
   ```

2. **Notification Service:**
   ```
   src/
   └── services/
       └── notifications/
           ├── handler.js
           └── broadcaster.js
   ```

3. **Client Integration:**
   ```
   src/
   └── components/
       └── chat/
           └── WebSocketClient.js
   ```

## Benefits for AWS Deployment

1. **Clearer Function Boundaries:**
   - Each Lambda function has a clear responsibility
   - Easier to manage IAM permissions per function

2. **Optimized Bundle Sizes:**
   - Logical separation allows for smaller Lambda deployment packages
   - Reduced cold start times

3. **Simplified CI/CD:**
   - Clear structure makes it easier to set up CI/CD pipelines
   - Can deploy only changed components

4. **Better Local-to-Cloud Parity:**
   - Local development environment mirrors cloud structure
   - Easier to test serverless functions locally

5. **Improved Monitoring and Debugging:**
   - Clear separation makes it easier to add logging and monitoring
   - Easier to identify and debug issues in specific functions

## Implementation Approach

1. **Reorganize Project First:**
   - Implement the project reorganization
   - Ensure the application works locally

2. **Add AWS Configuration:**
   - Add serverless.yml or similar configuration
   - Configure AWS services

3. **Adapt Services for AWS:**
   - Modify services to use AWS SDK
   - Update database layer for DynamoDB

4. **Deploy and Test:**
   - Deploy to AWS
   - Test functionality in cloud environment

This approach ensures a smooth transition to the AWS serverless architecture while improving the project structure.
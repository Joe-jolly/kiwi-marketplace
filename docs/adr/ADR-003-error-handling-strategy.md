# ADR-003: Error Handling Strategy

## Status

Accepted

## Date

2026-07-16

## Context

Kiwi Marketplace is designed for migrants living in Korea.

Many users are not familiar with technical error messages or English system responses.

The application should provide a friendly and localized user experience while keeping the backend aligned with standard HTTP practices.

## Decision

### Backend

The backend is responsible for:

- Returning standard HTTP status codes.
- Returning consistent JSON error responses.
- Not generating UI-specific messages.

Examples:

404 Not Found

```json
{
  "message": "Post not found",
  "statusCode": 404
}
```

401 Unauthorized

```json
{
  "message": "Invalid phone or password",
  "statusCode": 401
}
```

500 Internal Server Error

```json
{
  "message": "Internal server error",
  "statusCode": 500
}
```

### Frontend

The frontend is responsible for:

- Handling all API errors centrally.
- Displaying localized and user-friendly messages.
- Hiding technical error details from end users.

Examples:

| Backend Error         | User Message                                         |
| --------------------- | ---------------------------------------------------- |
| Post not found        | This post is no longer available.                    |
| User not found        | User not found.                                      |
| Unauthorized          | Phone number or password is incorrect.               |
| Network Error         | Please check your internet connection and try again. |
| Internal Server Error | Something went wrong. Please try again later.        |

The exact wording will be translated according to the user's selected language.

## Future Improvements

- Centralized Error Handler.
- Reusable Error Dialog component.
- Reusable Bottom Banner component.
- Offline detection.
- Retry action for recoverable errors.
- Error logging and monitoring.
- Multi-language support.

## Consequences

Benefits:

- Consistent error handling across the application.
- Better user experience.
- Easier localization.
- Backend remains independent from UI implementation.
- Frontend controls how errors are presented.

Trade-offs:

- Frontend requires an additional centralized error handling layer.
- Error message mapping must be maintained as the API grows.

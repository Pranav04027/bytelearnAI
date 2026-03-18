import { Prisma } from "@prisma/client";

const errorHandler = (err, req, res, next) => {
    const isPrismaError = err instanceof Prisma.PrismaClientKnownRequestError || 
                          err instanceof Prisma.PrismaClientValidationError;
    
    const statusCode = err.statusCode || (isPrismaError ? 400 : 500);
    const message = err.message || "Something went Wrong";

    const response = {
        success: false,
        statusCode,
        message,
        errors: err.errors || [],
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    };

    return res.status(statusCode).json(response);
};

export { errorHandler };
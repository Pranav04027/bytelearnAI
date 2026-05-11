import prismaPkg from "@prisma/client";

const { Prisma } = prismaPkg;

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
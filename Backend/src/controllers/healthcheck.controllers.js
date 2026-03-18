const healthcheck = async (req, res, next) => {
    try {
        //Logic of the endpoint
        return res.status(200).json({
            success: true,
            statusCode: 200,
            data: "OK",
            message: "Health check passed"
        });
    } catch (error) {
        next(error);
    }
};

export { healthcheck };
export const config = {
    host: process.env.HOST ?? "127.0.0.1", 
    port: Number(process.env.PORT ?? "8080")
};
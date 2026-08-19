// Reexporta el cliente que genera Prisma 7 en src/generated/prisma para que los
// módulos no queden acoplados a la ruta de salida del generador.
export * from '../generated/prisma/client';

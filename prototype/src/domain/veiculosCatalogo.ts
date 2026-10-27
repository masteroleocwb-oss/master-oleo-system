// Marcas e modelos mais comuns no Brasil, para a abertura de OS por lista.
// "Outro" libera digitação livre — a lista é ponto de partida e deve ser revisada pela oficina.
export const MARCAS_MODELOS: Record<string, string[]> = {
  Chevrolet: ['Onix', 'Onix Plus', 'Prisma', 'Cobalt', 'Cruze', 'Tracker', 'Equinox', 'Spin', 'Montana', 'S10', 'Trailblazer', 'Celta', 'Corsa', 'Classic'],
  Fiat: ['Mobi', 'Uno', 'Argo', 'Cronos', 'Palio', 'Siena', 'Grand Siena', 'Pulse', 'Fastback', 'Strada', 'Toro', 'Fiorino', 'Doblò'],
  Volkswagen: ['Up!', 'Gol', 'Voyage', 'Fox', 'Polo', 'Virtus', 'Nivus', 'T-Cross', 'Taos', 'Tiguan', 'Jetta', 'Saveiro', 'Amarok'],
  Ford: ['Ka', 'Ka Sedan', 'Fiesta', 'Focus', 'EcoSport', 'Territory', 'Ranger', 'Maverick'],
  Toyota: ['Etios', 'Yaris', 'Corolla', 'Corolla Cross', 'RAV4', 'Hilux', 'SW4'],
  Hyundai: ['HB20', 'HB20S', 'Creta', 'Tucson', 'ix35'],
  Honda: ['Fit', 'City', 'Civic', 'WR-V', 'HR-V', 'CR-V'],
  Renault: ['Kwid', 'Sandero', 'Logan', 'Stepway', 'Duster', 'Captur', 'Oroch', 'Kardian'],
  Nissan: ['March', 'Versa', 'Sentra', 'Kicks', 'Frontier'],
  Jeep: ['Renegade', 'Compass', 'Commander'],
  Peugeot: ['208', '2008', '3008', 'Partner'],
  'Citroën': ['C3', 'C3 Aircross', 'C4 Cactus', 'Basalt'],
  Mitsubishi: ['L200 Triton', 'Pajero', 'ASX', 'Outlander', 'Eclipse Cross'],
  Kia: ['Picanto', 'Cerato', 'Sportage', 'Sorento', 'Stonic'],
  'Caoa Chery': ['Tiggo 5x', 'Tiggo 7', 'Tiggo 8', 'Arrizo 6'],
  BYD: ['Dolphin', 'Dolphin Mini', 'Song Plus', 'Seal', 'King'],
  'Mercedes-Benz': ['Classe A', 'Classe C', 'GLA', 'Sprinter'],
  BMW: ['Série 1', 'Série 3', 'X1', 'X3'],
  Audi: ['A3', 'A4', 'Q3', 'Q5'],
};

export const MARCAS = Object.keys(MARCAS_MODELOS).sort((a, b) => a.localeCompare(b, 'pt-BR'));
export const OUTRO = '__outro__';

export const ANOS = (() => { const fim = new Date().getFullYear() + 1; const xs: number[] = []; for (let a = fim; a >= 1990; a--) xs.push(a); return xs; })();

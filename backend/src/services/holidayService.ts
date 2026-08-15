export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

export class HolidayService {
  // Mapa data -> nome do feriado (ex.: "2026-01-01" -> "Confraternização mundial")
  private static cache: Record<string, string> = {};
  private static lastYearFetched = 0;

  private static async ensureYear(year: number): Promise<void> {
    if (this.lastYearFetched === year) return;
    try {
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (response.ok) {
        const feriados = await response.json();
        feriados.forEach((f: any) => {
          this.cache[f.date] = f.name || 'Feriado';
        });
        
        // Feriados Estaduais/Municipais (SP) e Nacionais fixos de segurança
        this.cache[`${year}-07-09`] = 'Revolução Constitucionalista (SP)';
        this.cache[`${year}-01-25`] = 'Aniversário de São Paulo (SP)';
        this.cache[`${year}-11-20`] = 'Dia da Consciência Negra';

        this.lastYearFetched = year;
      }
    } catch (err) {
      console.error('Erro ao buscar feriados na Brasil API:', err);
    }
  }

  /** Lista de datas (YYYY-MM-DD) de feriados do ano. Mantido para compatibilidade. */
  static async getHolidays(year: number): Promise<string[]> {
    await this.ensureYear(year);
    const yearPrefix = `${year}-`;
    return Object.keys(this.cache).filter(date => date.startsWith(yearPrefix));
  }

  /** Lista detalhada de feriados do ano, com nome. */
  static async getHolidaysDetailed(year: number): Promise<Holiday[]> {
    await this.ensureYear(year);
    const yearPrefix = `${year}-`;
    return Object.keys(this.cache)
      .filter(date => date.startsWith(yearPrefix))
      .sort()
      .map(date => ({ date, name: this.cache[date] }));
  }

  static async isHoliday(date: Date): Promise<boolean> {
    await this.ensureYear(date.getFullYear());

    const yearStr = date.getFullYear();
    const monthStr = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateString = `${yearStr}-${monthStr}-${dayStr}`;

    return !!this.cache[dateString];
  }
}

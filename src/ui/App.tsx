import { useEffect, useMemo, useRef, useState } from 'react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Stack from '@mui/material/Stack';
import Autocomplete from '@mui/material/Autocomplete';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import SummaryBar from './components/SummaryBar';
import OpenCloseBars from './components/OpenCloseBars';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/pt-br';
import type { ChangeEvent } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Papa from 'papaparse';
import { LimitEntry } from '../types/limits';
import { exportElementToPdf } from '../utils/exportPdf';
import { svgElementToPngDataUrl } from '../utils/svgToPng';
import './reportPdf.css';

// Fonte de limites agora vem de public/limites.json

type Status = 'Todos' | 'Normal' | 'Falha';

// Estrutura dos campos usados pelo processamento
type CsvRow = {
  datetime?: string; // "aaaa-mm-dd hh:mm:ss"
  'extendedData.state'?: string;
  message?: string;
  pointname?: string;
  eventsources?: string; // JSON array string with SRV1/SRV2 entries
  // permitir outros campos sem tipar todos
  [k: string]: unknown;
};

type ProcessedRow = {
  date: string; // YYYY-MM-DD (from SRV2)
  time: string; // HH:mm:ss.SSS (from SRV2)
  state: string;
  message: string;
  pointname: string;
  rawDatetime: string; // ISO from SRV2 e.g. 2025-12-08T04:28:12.936000-03:00
};

type CycleType = 'Abrir' | 'Fechar';
type CycleStatus = 'Normal' | 'Falha';
type CycleResult = {
  commandAt: string; // raw datetime
  type: CycleType;
  zsl?: { at: string; state: string };
  zsh?: { at: string; state: string };
  result: CycleStatus;
  t1Sec?: number; // cmd -> ZSH Normal (Fechar) | cmd -> ZSL Normal (Abrir)
  t2Sec?: number; // cmd -> ZSL Atuado (Fechar) | cmd -> ZSH Atuado (Abrir)
  limitSec?: number; // limite conforme Abertura/Fechamento
};

export default function App() {
  const [tags, setTags] = useState<string[]>([]);
  const [limitsByTag, setLimitsByTag] = useState<Record<string, { open: number; close: number }>>({});
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [status, setStatus] = useState<Status>('Todos');
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs().startOf('day'));
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs().endOf('day'));
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // removido preview/debug
  const [cycles, setCycles] = useState<CycleResult[]>([]);
  const [cyclesCount, setCyclesCount] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const summaryPngRef = useRef<HTMLImageElement | null>(null);

  // Load Tag list from public/limites.json (TagBusca column)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}limites.json`)
      .then((res) => res.json())
      .then((rows: LimitEntry[]) => {
        const unique = Array.from(new Set(rows.map((r) => r.TagBusca?.trim()).filter(Boolean) as string[]));
        unique.sort((a, b) => a.localeCompare(b, 'pt-BR'));
        setTags(unique);

        const map: Record<string, { open: number; close: number }> = {};
        for (const r of rows) {
          const key = r.TagBusca?.trim();
          if (!key) continue;
          const open = r.LimiteAbertura;
          const close = r.LimiteFechamento;
          if (Number.isFinite(open) && Number.isFinite(close)) map[key] = { open, close };
        }
        setLimitsByTag(map);
      })
      .catch(() => setMessage('Não foi possível carregar limites.json'));
  }, []);

  const canSearch = useMemo(() => !!selectedTag && !!startDate && !!endDate && !!file, [selectedTag, startDate, endDate, file]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
  };

  const handleSearch = () => {
    if (!file || !startDate || !endDate) return;

    // Converter período para YYYY-MM-DD (compatível com backend)
    const startStr = startDate.format('YYYY-MM-DD');
    const endStr = endDate.format('YYYY-MM-DD');

    const results: ProcessedRow[] = [];
    let total = 0;

    // Preparar regex dos pointnames esperados a partir da TAG simplificada
    const buildRegexes = (tag: string) => {
      // Ex.: SDV-1210012G → tipo=SDV, num=1210012G, area=1210, malha=012G
      const [simpleType, num] = tag.split('-');
      const area = (num || '').slice(0, 4);
      const malha = (num || '').slice(4);
      const mapType: Record<string, string> = { SDV: 'SDY', BDV: 'BDY', ADV: 'ADY' };
      const plcType = mapType[simpleType] || 'SDY';
      const systems = '(PSD|FGS|HSD)';
      const base = `${area}${malha}`.replace(/[-_.]/g, '');
      const cmd = new RegExp(`^${systems}_${plcType}_${base}_SLO$`, 'i');
  const zsl = new RegExp(`^${systems}_ZSL_${base}_EPT$`, 'i');
  const zsh = new RegExp(`^${systems}_ZSH_${base}_EPT$`, 'i');
      return { cmd, zsl, zsh };
    };

    const regexes = buildRegexes(selectedTag);

    const addIfMatches = (row: CsvRow) => {
      // Prefer SRV2 datetime from eventsources JSON
      let dt = (row.datetime || '').toString().trim();
      try {
        if (row.eventsources) {
          const arr = JSON.parse(row.eventsources.toString());
          if (Array.isArray(arr)) {
            const srv2 = arr.find((e: any) => e && e.eventsource === 'SDW_SRV2');
            if (srv2?.datetime) {
              dt = srv2.datetime.toString();
            }
          }
        }
      } catch {
        // ignore parse errors and fall back to first column datetime
      }
      const pn = (row.pointname || '').toString();
      const st = (row['extendedData.state'] || '').toString();
      const msg = (row.message || '').toString();

      if (!dt) return; // precisa de datetime
      // dt expected ISO with offset e.g. 2025-12-08T04:28:12.936000-03:00
      const iso = dt.replace(/(\.\d{6})([+-]\d{2}:\d{2})$/, (m, frac, tz) => `${frac.slice(0,4)}${tz}`); // clamp micros to 3 decimals
      const d = dayjs(iso);
      if (!d.isValid()) return;
      const dateISO = d.format('YYYY-MM-DD');
      const time = d.format('HH:mm:ss.SSS');

      // Filtrar por pointnames esperados (comando/sensores) da TAG
      const matchesExpected = regexes.cmd.test(pn) || regexes.zsl.test(pn) || regexes.zsh.test(pn);
      if (!matchesExpected) return;

      // Filtrar por período (compara pela parte de data)
      if (dateISO < startStr || dateISO > endStr) return;

      // Filtrar por status
      // Nesta fase dos eventos individuais não aplicamos o filtro de ciclo;
      // o filtro por Status será aplicado após construir os ciclos.

      const item: ProcessedRow = {
        date: dateISO,
        time,
        state: st,
        message: msg,
        pointname: pn,
        rawDatetime: iso,
      };
      results.push(item);
    };

  setMessage('Processando arquivo, aguarde...');
  // limpar resultados prévios

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      step: (step: any) => {
        const row = step.data as CsvRow;
        addIfMatches(row);
      },
      complete: () => {
        // Ordenar cronologicamente (mais antigos em cima)
        results.sort((a, b) => (a.rawDatetime < b.rawDatetime ? -1 : a.rawDatetime > b.rawDatetime ? 1 : 0));

  // contagem de eventos apenas para mensagem

        // Montar ciclos Abrir/Fechar com base na sequência definida
        const cyclesAll: CycleResult[] = [];
        let pending: CycleResult | null = null;

        const isCmd = (pn: string) => regexes.cmd.test(pn);
        const isZSL = (pn: string) => regexes.zsl.test(pn);
        const isZSH = (pn: string) => regexes.zsh.test(pn);

        for (const ev of results) {
          if (isCmd(ev.pointname)) {
            // Se havia um ciclo pendente sem completar, fecha como Falha
            if (pending && (!pending.zsl || !pending.zsh)) {
              pending.result = 'Falha';
              cyclesAll.push(pending);
            }
            const type: CycleType = ev.state.trim() === 'Fechar' ? 'Fechar' : 'Abrir';
            pending = { commandAt: ev.rawDatetime, type, result: 'Falha' };
            continue;
          }

          if (!pending) continue; // ignorar sensores sem comando vigente

          if (isZSL(ev.pointname) && !pending.zsl) {
            pending.zsl = { at: ev.rawDatetime, state: ev.state };
          } else if (isZSH(ev.pointname) && !pending.zsh) {
            pending.zsh = { at: ev.rawDatetime, state: ev.state };
          }

          if (pending.zsl && pending.zsh) {
            const zslOk = pending.type === 'Abrir' ? pending.zsl.state === 'Normal' : pending.zsl.state === 'Atuado';
            const zshOk = pending.type === 'Abrir' ? pending.zsh.state === 'Atuado' : pending.zsh.state === 'Normal';
            pending.result = zslOk && zshOk ? 'Normal' : 'Falha';
            cyclesAll.push(pending);
            pending = null;
          }
        }

        // Se terminou com ciclo pendente, fecha como Falha
        if (pending) {
          pending.result = 'Falha';
          cyclesAll.push(pending);
        }

  // Aplicar filtro por Status (ciclo)
  // Calcular T1/T2 em segundos e comparar com limites
  const limitTag = limitsByTag[selectedTag];
  // Nova regra de limite: usar LimiteAbertura para ciclos de Abrir e LimiteFechamento para ciclos de Fechar
  // (correção: antes forçávamos SDV sempre a usar close e BDV/ADV open, o que causou uso de 24s em Abrir para SDV-1223003)

        const filteredCycles = cyclesAll
          .map((c) => {
            const cmd = dayjs(c.commandAt);
            let t1: number | undefined;
            let t2: number | undefined;
            if (c.type === 'Fechar') {
              // T1: cmd -> ZSH Normal; T2: cmd -> ZSL Atuado
              if (c.zsh && c.zsh.state === 'Normal') t1 = dayjs(c.zsh.at).diff(cmd, 'millisecond') / 1000;
              if (c.zsl && c.zsl.state === 'Atuado') t2 = dayjs(c.zsl.at).diff(cmd, 'millisecond') / 1000;
            } else {
              // Abrir: T1: cmd -> ZSL Normal; T2: cmd -> ZSH Atuado
              if (c.zsl && c.zsl.state === 'Normal') t1 = dayjs(c.zsl.at).diff(cmd, 'millisecond') / 1000;
              if (c.zsh && c.zsh.state === 'Atuado') t2 = dayjs(c.zsh.at).diff(cmd, 'millisecond') / 1000;
            }
            // Seleção do limite:
            //  - Ciclo Abrir  => usa LimiteAbertura (coluna LimiteAbertura)
            //  - Ciclo Fechar => usa LimiteFechamento (coluna LimiteFechamento)
            // Salvaguarda: se algum valor vier NaN ou ausente, não invalida automaticamente o ciclo;
            // nesse caso limitSec fica undefined e a verificação 'within' sempre retorna true.
            let limitSec: number | undefined;
            if (limitTag) {
              const raw = c.type === 'Abrir' ? limitTag.open : limitTag.close;
              if (Number.isFinite(raw)) limitSec = raw;
            }
            // Verificar coerência dos estados esperados
            const zslOk = c.type === 'Abrir' ? c.zsl?.state === 'Normal' : c.zsl?.state === 'Atuado';
            const zshOk = c.type === 'Abrir' ? c.zsh?.state === 'Atuado' : c.zsh?.state === 'Normal';
            const within = (v?: number) => (limitSec != null && v != null ? v <= limitSec : true);
            const bothPresent = Boolean(c.zsl) && Boolean(c.zsh);
            const finalRes: CycleStatus = bothPresent && !!zslOk && !!zshOk && within(t1) && within(t2) ? 'Normal' : 'Falha';
            return { ...c, t1Sec: t1, t2Sec: t2, limitSec, result: finalRes } as CycleResult;
          })
          .filter((c) => (status === 'Todos' ? true : c.result === status));
        setCycles(filteredCycles);
        setCyclesCount(filteredCycles.length);
  setHasSearched(true);

        const labelStatus: Record<Status, string> = { Todos: 'Todos', Normal: 'Normal', Falha: 'Falha' };
        setMessage(
          `Encontrado ${results.length} evento(s) e ${filteredCycles.length} ciclo(s) para ${selectedTag} de ${startDate.format('DD/MM/YYYY')} até ${endDate.format('DD/MM/YYYY')} com status ${labelStatus[status]}.`
        );

      },
      error: () => setMessage('Erro ao ler o arquivo CSV carregado.'),
    });
  };

  const handleClear = () => {
    setSelectedTag('');
    setStatus('Todos');
    setStartDate(null);
    setEndDate(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setMessage('');
    setHasSearched(false);
  };

  const handleExport = async () => {
    const el = reportRef.current;
    if (!el) return;
    const dataIni = startDate ? startDate.format('YYYY-MM-DD') : 'inicio';
    const dataFim = endDate ? endDate.format('YYYY-MM-DD') : 'fim';
    const tag = selectedTag || 'Relatorio';
    const fileName = `${tag}_Report_${dataIni}_${dataFim}.pdf`;
    // Antes de ativar estilos PDF, captura o gráfico de análise em PNG para preservar proporções
    try {
      const summaryChartSvg = el.querySelector('.chart-summary svg.recharts-surface') as SVGSVGElement | null;
      if (summaryChartSvg) {
        const png = await svgElementToPngDataUrl(summaryChartSvg, 2);
        // injeta uma imagem somente-PDF como template
        let img = el.querySelector('#summary-chart-pdf-img') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.id = 'summary-chart-pdf-img';
          img.alt = 'summary-chart-pdf';
          img.style.display = 'none';
          const container = el.querySelector('.chart-summary .chart-inner');
          if (container) container.appendChild(img);
        }
        img.src = png;
        summaryPngRef.current = img;
      }
    } catch {
      // falha silenciosa, continua com html2pdf padrão
    }

    // Ativa estilos específicos de PDF durante a geração
    el.classList.add('pdf-export');
    try {
      const title = 'FPSO P-58 - Relatório de atuação de válvulas';
      const tagMeta = `Tag: ${selectedTag || '-'}`;
      const periodMeta = `Período: ${startDate?.format('DD/MM/YYYY') || '-'} até ${endDate?.format('DD/MM/YYYY') || '-'}`;
      await exportElementToPdf(el, {
        fileName,
        marginCm: 2.0,
        headerFooter: {
          title,
          tag: tagMeta,
          period: periodMeta,
          logoUrl: import.meta.env.BASE_URL + 'logo_petrobras.png',
        },
      });
    } finally {
      el.classList.remove('pdf-export');
      // limpa imagem temporária
      if (summaryPngRef.current) {
        summaryPngRef.current.remove();
        summaryPngRef.current = null;
      }
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pt-br">
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <div className="report-title-banner">FPSO P-58 - Relatório de atuação de válvulas</div>

  <Box component="form" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
          <Stack spacing={2}>
            {/* Linha 1: Tag + Data Início + Data Fim + Status */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Box sx={{ flex: 2, minWidth: 240 }}>
                <Autocomplete<string>
                  options={tags}
                  value={selectedTag || null}
                  onChange={(_, v) => setSelectedTag(v ?? '')}
                  autoComplete
                  includeInputInList
                  renderInput={(params) => (
                    <TextField {...params} label="Tag da Válvula" placeholder="Digite para filtrar" />
                  )}
                />
              </Box>

              <Box sx={{ flex: 1, minWidth: 180 }}>
                <DatePicker
                  label="Data Início"
                  value={startDate}
                  onChange={setStartDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Box>

              <Box sx={{ flex: 1, minWidth: 180 }}>
                <DatePicker
                  label="Data Fim"
                  value={endDate}
                  onChange={setEndDate}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Box>

      <Box sx={{ flex: 1, minWidth: 200 }}>
                <FormControl fullWidth>
                  <InputLabel id="status-label">Status</InputLabel>
                  <Select
                    labelId="status-label"
                    label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                  >
        <MenuItem value="Todos">Todos</MenuItem>
        <MenuItem value="Normal">Normal</MenuItem>
        <MenuItem value="Falha">Falha</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Stack>

            {/* Linha 2: Upload de arquivo */}
            <TextField
              type="file"
              inputProps={{ accept: '.csv' }}
              onChange={onFileChange}
              inputRef={fileInputRef}
              fullWidth
            />

            {/* Linha 3: Botões */}
            <Stack direction="row" spacing={2}>
              <Button variant="contained" disabled={!canSearch} onClick={handleSearch}>
                Buscar
              </Button>
              <Button variant="outlined" onClick={handleClear}>
                Limpar
              </Button>
              {hasSearched && (
                <Button variant="outlined" color="secondary" onClick={handleExport}>
                  Exportar
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>

        {message && (
          <Box mt={3} ref={reportRef}>
            {/* Cabeçalho HTML (ocultado só no PDF, mantido na web) */}
            <Box className="report-header-html" display="flex" alignItems="center" mb={2} sx={{ borderBottom: '1px solid #e0e0e0', pb: 1 }}>
              <img src={import.meta.env.BASE_URL + 'logo_petrobras.png'} alt="Petrobras" style={{ width: 180, height: 'auto', marginRight: 12 }} />
              <Box>
                <Typography variant="h6">FPSO P-58 - Relatório de atuação de válvulas</Typography>
                <Typography variant="body2" color="text.secondary" className="report-meta">
                  Tag: {selectedTag || '-'} | Período: {startDate?.format('DD/MM/YYYY') || '-'} até {endDate?.format('DD/MM/YYYY') || '-'}
                </Typography>
              </Box>
            </Box>
      <Typography variant="subtitle1" className="report-status">{message}</Typography>
            {cycles.length > 0 && (
              <Box mt={3}>
                <Table size="small" sx={{ '& .MuiTableCell-root': { textAlign: 'center' } }}>
                  <TableHead>
                    <TableRow>
            <TableCell align="center">Data</TableCell>
            <TableCell align="center">Hora</TableCell>
            <TableCell align="center">Comando</TableCell>
            <TableCell align="center">T1 (s)</TableCell>
            <TableCell align="center">T2 (s)</TableCell>
                      <TableCell align="center">T2max (s)</TableCell>
            <TableCell align="center">Resultado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cycles.map((c, i) => {
                      const over = (v?: number, lim?: number) => (v != null && lim != null ? v > lim : false);
                      const d = dayjs(c.commandAt);
                      return (
                        <TableRow
                          key={i}
                          sx={{
                            backgroundColor: c.result === 'Falha' ? 'rgba(224, 73, 58, 0.08)' : 'inherit',
                          }}
                        >
              <TableCell align="center">{d.format('DD/MM/YYYY')}</TableCell>
              <TableCell align="center">{d.format('HH:mm:ss.SSS')}</TableCell>
              <TableCell align="center">{c.type}</TableCell>
              <TableCell align="center" style={{ color: over(c.t1Sec, c.limitSec) ? '#d32f2f' : undefined }}>
                            {c.t1Sec ?? '-'}
                          </TableCell>
              <TableCell align="center" style={{ color: over(c.t2Sec, c.limitSec) ? '#d32f2f' : undefined }}>
                            {c.t2Sec ?? '-'}
                          </TableCell>
              <TableCell align="center">{c.limitSec ?? '-'}</TableCell>
              <TableCell align="center">{c.result}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}

            {cycles.length > 0 && (
              <Box mt={2} className="chart-block">
                {(() => {
                  // tempos por ciclo (prioriza T2; fallback T1)
                  const openTimes = cycles
                    .filter((c) => c.type === 'Abrir')
                    .map((c) => (typeof c.t2Sec === 'number' ? c.t2Sec : typeof c.t1Sec === 'number' ? c.t1Sec : 0));
                  const closeTimes = cycles
                    .filter((c) => c.type === 'Fechar')
                    .map((c) => (typeof c.t2Sec === 'number' ? c.t2Sec : typeof c.t1Sec === 'number' ? c.t1Sec : 0));

                  const lt = limitsByTag[selectedTag];
                  const openThreshold = lt?.open ?? 0;
                  const closeThreshold = lt?.close ?? 0;

                  return (
                    <OpenCloseBars
                      openTimes={openTimes}
                      closeTimes={closeTimes}
                      openThreshold={openThreshold}
                      closeThreshold={closeThreshold}
                    />
                  );
                })()}
              </Box>
            )}

            {cycles.length > 0 && (
              <Box mt={3} className="chart-block">
                {(() => {
                  const total = cycles.length;
                  const normais = cycles.filter((c) => c.result === 'Normal').length;
                  const falhas = total - normais;
                  return (
                    <SummaryBar
                      total={total}
                      normais={normais}
                      falhas={falhas}
                      title="Análise de atuações no período"
                    />
                  );
                })()}
              </Box>
            )}
          </Box>
        )}
      </Container>
    </LocalizationProvider>
  );
}

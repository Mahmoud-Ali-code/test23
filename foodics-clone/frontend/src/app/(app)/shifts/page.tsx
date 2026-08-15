'use client';
import { useEffect, useState } from 'react';
import { api, formatSAR, formatDate, downloadFile } from '@/lib/api';
import { toast } from '@/components/Toast';
import {
  Clock, Play, X, AlertCircle, Banknote, CreditCard, Smartphone,
  TrendingUp, Receipt, ScrollText, RefreshCw, FileText, History, ArrowDownCircle, ArrowUpCircle, Download,
} from 'lucide-react';

const METHOD_LABELS: any = {
  CASH: { label: 'كاش', icon: Banknote, color: 'emerald' },
  CARD: { label: 'بطاقة', icon: CreditCard, color: 'blue' },
  INSTAPAY: { label: 'إنستاباي', icon: Smartphone, color: 'purple' },
};

export default function ShiftsPage() {
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [xReport, setXReport] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [xLoading, setXLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open form
  const [openingFloat, setOpeningFloat] = useState<string>('0');
  const [openNotes, setOpenNotes] = useState<string>('');

  // Close form
  const [actualCash, setActualCash] = useState<string>('0');
  const [closeNotes, setCloseNotes] = useState<string>('');

  // View past Z-Report
  const [pastReport, setPastReport] = useState<any | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, l] = await Promise.all([
        api.get('/shifts/active'),
        api.get('/shifts'),
      ]);
      setActiveShift(a.data.shift);
      setHistory(l.data.shifts || []);
      // If active shift exists, auto-load X-Report
      if (a.data.shift) {
        setXLoading(true);
        const x = await api.get(`/shifts/${a.data.shift.id}/x-report`);
        setXReport(x.data.report);
        setXLoading(false);
      } else {
        setXReport(null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'فشل تحميل الشيفتات');
    } finally {
      setLoading(false);
    }
  };

  const openShift = async () => {
    const amt = parseFloat(openingFloat);
    if (!isFinite(amt) || amt < 0) {
      alert('الرصيد الافتتاحي يجب أن يكون رقم غير سالب');
      return;
    }
    setOpening(true);
    try {
      await api.post('/shifts/open', { openingFloat: amt, notes: openNotes || undefined });
      setOpeningFloat('0'); setOpenNotes('');
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'فشل فتح الشيفت');
    } finally {
      setOpening(false);
    }
  };

  const closeShift = async () => {
    if (!activeShift) return;
    const amt = parseFloat(actualCash);
    if (!isFinite(amt) || amt < 0) {
      alert('النقدية الفعلية يجب أن تكون رقم غير سالب');
      return;
    }
    if (!confirm('إغلاق الشيفت؟ لن تستطيع تعديله بعد ذلك.')) return;
    setClosing(true);
    try {
      const r = await api.post(`/shifts/${activeShift.id}/close`, { actualCash: amt, notes: closeNotes || undefined });
      // Show the Z-Report inline
      setPastReport({ ...r.data.report, shift: r.data.shift });
      setActualCash('0'); setCloseNotes('');
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'فشل إغلاق الشيفت');
    } finally {
      setClosing(false);
    }
  };

  const loadPastReport = async (id: string) => {
    try {
      // For closed shifts, the x-report endpoint still returns the totals (it just doesn't lock anything)
      const r = await api.get(`/shifts/${id}/x-report`);
      setPastReport(r.data.report);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'فشل تحميل التقرير');
    }
  };

  // F-F: download the X or Z report as a PDF file
  const printShiftPdf = async (id: string, type: 'X' | 'Z' = 'X') => {
    try {
      await downloadFile(`/shifts/${id}/report.pdf?type=${type}`, `shift-${type}-${id.slice(0, 8)}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل PDF');
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6" /> الشيفتات
          </h1>
          <p className="text-sm text-ink-500 mt-1">فتح وإغلاق شيفت الكاشير — تسوية النقدية</p>
        </div>
        <button onClick={load} className="btn-ghost" title="تحديث">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-ink-400 py-12">جاري التحميل...</div>
      ) : !activeShift ? (
        <OpenShiftCard
          openingFloat={openingFloat}
          setOpeningFloat={setOpeningFloat}
          notes={openNotes}
          setNotes={setOpenNotes}
          submitting={opening}
          onSubmit={openShift}
        />
      ) : (
        <>
          <ActiveShiftHeader shift={activeShift} />
          <div className="grid lg:grid-cols-2 gap-4">
            <XReportCard
              report={xReport}
              loading={xLoading}
              shiftId={activeShift?.id}
              onPrintPdf={printShiftPdf}
              onRefresh={async () => {
                setXLoading(true);
                try {
                  const x = await api.get(`/shifts/${activeShift.id}/x-report`);
                  setXReport(x.data.report);
                } finally { setXLoading(false); }
              }}
            />
            <CloseShiftCard
              report={xReport}
              actualCash={actualCash}
              setActualCash={setActualCash}
              notes={closeNotes}
              setNotes={setCloseNotes}
              submitting={closing}
              onSubmit={closeShift}
            />
          </div>
        </>
      )}

      <HistorySection shifts={history} onViewReport={loadPastReport} onPrintPdf={printShiftPdf} />

      {pastReport && (
        <ZReportModal report={pastReport} onClose={() => setPastReport(null)} />
      )}
    </div>
  );
}

function OpenShiftCard({ openingFloat, setOpeningFloat, notes, setNotes, submitting, onSubmit }: any) {
  return (
    <div className="card p-6 border-2 border-dashed border-ink-300 bg-gradient-to-l from-emerald-50 to-white">
      <div className="text-center mb-6">
        <div className="inline-flex bg-emerald-100 p-4 rounded-2xl mb-3">
          <Play className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold mb-1">مفيش شيفت مفتوح</h2>
        <p className="text-sm text-ink-500">افتح شيفت عشان تبدأ تسجيل المبيعات</p>
      </div>
      <div className="max-w-md mx-auto space-y-3">
        <div>
          <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي (نقدية في الدرج)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            className="input text-lg"
            placeholder="0.00"
            autoFocus
          />
          <p className="text-xs text-ink-500 mt-1">النقدية اللي في الدرج قبل بداية الشيفت</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">ملاحظات (اختياري)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            placeholder="أي ملاحظات على الشيفت..."
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          {submitting ? 'جاري الفتح...' : 'فتح الشيفت'}
        </button>
      </div>
    </div>
  );
}

function ActiveShiftHeader({ shift }: { shift: any }) {
  const ageMins = Math.floor((Date.now() - new Date(shift.openedAt).getTime()) / 60000);
  const ageH = Math.floor(ageMins / 60);
  const ageM = ageMins % 60;
  return (
    <div className="card p-4 bg-gradient-to-l from-emerald-50 to-white border-2 border-emerald-200">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-3 rounded-xl">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-lg">شيفت مفتوح</div>
            <div className="text-xs text-ink-500">
              {shift.user?.name} • فتح في {formatDate(shift.openedAt)} • من {ageH > 0 ? `${ageH} ساعة ` : ''}{ageM} دقيقة
            </div>
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs text-ink-500">الرصيد الافتتاحي</div>
          <div className="text-2xl font-bold text-emerald-600">{formatSAR(shift.openingFloat)}</div>
        </div>
      </div>
    </div>
  );
}

function XReportCard({ report, loading, onRefresh, onPrintPdf, shiftId }: any) {
  if (!report) return null;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" /> تقرير X (مؤقت)
        </h3>
        <div className="flex gap-2">
          {/* F-F: PDF export button */}
          {shiftId && (
            <button onClick={() => onPrintPdf?.(shiftId, 'X')} className="text-xs btn-ghost" title="تنزيل PDF">
              <Download className="w-3 h-3" /> PDF
            </button>
          )}
          <button onClick={onRefresh} disabled={loading} className="text-xs btn-ghost">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
        </div>
      </div>
      <p className="text-xs text-ink-500 mb-3">ملخص الشيفت الحالي بدون إغلاقه</p>

      <div className="space-y-2">
        <Row label="الرصيد الافتتاحي" value={formatSAR(report.openingFloat)} />
        <Divider />
        <SubHeader>المقبوضات (خلال الشيفت)</SubHeader>
        {(['CASH', 'CARD', 'INSTAPAY'] as const).map((m) => {
          const cfg = METHOD_LABELS[m];
          const v = report[`${m.toLowerCase()}Collected`] || 0;
          if (v === 0) return null;
          const Icon = cfg.icon;
          return (
            <Row
              key={m}
              label={<span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {cfg.label}</span>}
              value={formatSAR(v)}
              colorClass="text-emerald-600"
            />
          );
        })}
        <Row label="صافي الإيرادات" value={formatSAR(report.netRevenue)} colorClass="text-emerald-700 font-bold" bold />
        <Divider />
        <SubHeader>المسدودات</SubHeader>
        {report.cashRefunds > 0 && <Row label="استرداد نقدي" value={-report.cashRefunds} colorClass="text-red-600" />}
        {report.cashExpenses > 0 && <Row label="مصروفات نقدية" value={-report.cashExpenses} colorClass="text-red-600" />}
        <Divider />
        <Row label="عدد الطلبات" value={report.ordersCount} />
        <Row label="طلبات مدفوعة" value={report.paidOrdersCount} />
        <Divider />
        <Row label="النقدية المتوقعة في الدرج" value={formatSAR(report.expectedCash)} colorClass="text-blue-600 font-bold" bold large />
      </div>
    </div>
  );
}

function CloseShiftCard({ report, actualCash, setActualCash, notes, setNotes, submitting, onSubmit }: any) {
  if (!report) return null;
  const expected = report.expectedCash;
  const actual = parseFloat(actualCash) || 0;
  const diff = actual - expected;
  return (
    <div className="card p-5 border-2 border-amber-200">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <ScrollText className="w-5 h-5 text-amber-600" /> إغلاق الشيفت (Z-Report)
      </h3>
      <p className="text-xs text-ink-500 mb-3">عدّ النقدية في الدرج وأدخل المبلغ الفعلي — الفرق هيكون العجز/الزيادة</p>

      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <div className="text-sm text-blue-700">المتوقع في الدرج</div>
          <div className="text-xl font-bold text-blue-700">{formatSAR(expected)}</div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">النقدية الفعلية (اللي عددتها)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            className="input text-lg"
            placeholder="0.00"
            autoFocus
          />
        </div>

        {actual > 0 && (
          <div className={`rounded-lg p-3 flex items-center justify-between ${
            Math.abs(diff) < 0.01
              ? 'bg-emerald-50 border border-emerald-200'
              : diff > 0
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-red-50 border border-red-200'
          }`}>
            <div className={`text-sm font-medium ${
              Math.abs(diff) < 0.01 ? 'text-emerald-700' : diff > 0 ? 'text-amber-700' : 'text-red-700'
            }`}>
              {Math.abs(diff) < 0.01
                ? '✅ تمام — الدرج مطابق'
                : diff > 0
                  ? `📈 زيادة ${formatSAR(diff)}`
                  : `📉 عجز ${formatSAR(-diff)}`}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">ملاحظات الإغلاق (اختياري)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            rows={2}
            placeholder="سبب العجز/الزيادة، ملاحظات على الشيفت..."
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
        >
          <ScrollText className="w-4 h-4" />
          {submitting ? 'جاري الإغلاق...' : 'إغلاق الشيفت'}
        </button>
      </div>
    </div>
  );
}

function HistorySection({ shifts, onViewReport, onPrintPdf }: any) {
  return (
    <div>
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <History className="w-5 h-5 text-ink-500" /> سجل الشيفتات
      </h3>
      {shifts.length === 0 ? (
        <div className="card p-8 text-center text-ink-400">
          <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>مفيش شيفتات سابقة</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50">
              <tr className="text-right text-ink-500">
                <th className="p-3">الكاشير</th>
                <th className="p-3">الفتح</th>
                <th className="p-3">الإغلاق</th>
                <th className="p-3">المدة</th>
                <th className="p-3">الافتتاحي</th>
                <th className="p-3">الإغلاق</th>
                <th className="p-3">الفرق</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s: any) => {
                const opened = new Date(s.openedAt);
                const closed = s.closedAt ? new Date(s.closedAt) : null;
                const dur = closed ? Math.floor((closed.getTime() - opened.getTime()) / 60000) : null;
                const durStr = dur === null ? '—' : dur > 60 ? `${Math.floor(dur / 60)} س ${dur % 60} د` : `${dur} د`;
                const diff = s.difference ?? null;
                return (
                  <tr key={s.id} className="border-t border-ink-100 hover:bg-ink-50">
                    <td className="p-3">
                      <div className="font-semibold">{s.user?.name || '—'}</div>
                      <div className="text-xs text-ink-500">{s.user?.role || ''}</div>
                    </td>
                    <td className="p-3 text-xs">{formatDate(s.openedAt)}</td>
                    <td className="p-3 text-xs">{closed ? formatDate(closed.toISOString()) : <span className="text-emerald-600 font-medium">مفتوح</span>}</td>
                    <td className="p-3 text-xs text-ink-600">{durStr}</td>
                    <td className="p-3">{formatSAR(s.openingFloat)}</td>
                    <td className="p-3">{s.closingFloat !== null && s.closingFloat !== undefined ? formatSAR(s.closingFloat) : '—'}</td>
                    <td className="p-3">
                      {diff === null ? <span className="text-ink-400">—</span> : (
                        <span className={`font-bold ${
                          Math.abs(diff) < 0.01 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {diff > 0 ? '+' : ''}{formatSAR(diff)}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {closed && (
                          <button onClick={() => onViewReport(s.id)} className="text-xs btn-ghost" title="عرض التقرير">
                            <FileText className="w-3 h-3" /> عرض
                          </button>
                        )}
                        {/* F-F: PDF download for both open and closed shifts */}
                        <button onClick={() => onPrintPdf?.(s.id, s.status === 'CLOSED' ? 'Z' : 'X')} className="text-xs btn-ghost" title="تنزيل PDF">
                          <Download className="w-3 h-3" /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ZReportModal({ report, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 bg-ink-50 flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-amber-600" /> تقرير Z (إغلاق)
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-ink-100 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <Row label="الرصيد الافتتاحي" value={formatSAR(report.openingFloat)} />
          <Divider />
          <SubHeader>المقبوضات</SubHeader>
          {(['CASH', 'CARD', 'INSTAPAY'] as const).map((m) => {
            const v = report[`${m.toLowerCase()}Collected`] || 0;
            if (v === 0) return null;
            const cfg = METHOD_LABELS[m];
            return <Row key={m} label={cfg.label} value={formatSAR(v)} colorClass="text-emerald-600" />;
          })}
          <Row label="صافي الإيرادات" value={formatSAR(report.netRevenue)} colorClass="text-emerald-700 font-bold" bold />
          <Divider />
          {report.cashRefunds > 0 && <Row label="استرداد نقدي" value={-report.cashRefunds} colorClass="text-red-600" />}
          {report.cashExpenses > 0 && <Row label="مصروفات نقدية" value={-report.cashExpenses} colorClass="text-red-600" />}
          <Divider />
          <Row label="طلبات" value={report.ordersCount} />
          <Row label="طلبات مدفوعة" value={report.paidOrdersCount} />
          <Divider />
          {report.difference !== undefined && (
            <div className={`rounded-lg p-3 text-center ${
              Math.abs(report.difference) < 0.01
                ? 'bg-emerald-50 border border-emerald-200'
                : report.difference > 0
                  ? 'bg-amber-50 border border-amber-200'
                  : 'bg-red-50 border border-red-200'
            }`}>
              <div className="text-xs text-ink-600 mb-1">
                {Math.abs(report.difference) < 0.01 ? 'الدرج مطابق' : report.difference > 0 ? 'زيادة' : 'عجز'}
              </div>
              <div className={`text-2xl font-bold ${
                Math.abs(report.difference) < 0.01 ? 'text-emerald-600' : report.difference > 0 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {report.difference > 0 ? '+' : ''}{formatSAR(report.difference)}
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-ink-200 bg-ink-50 text-center">
          <button onClick={onClose} className="btn-primary text-sm">إغلاق</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, colorClass = '', bold, large }: any) {
  return (
    <div className={`flex items-center justify-between ${large ? 'py-1' : ''}`}>
      <div className={`text-sm ${bold ? 'font-bold' : 'text-ink-600'}`}>{label}</div>
      <div className={`${bold ? 'font-bold' : 'font-semibold'} ${large ? 'text-lg' : 'text-sm'} ${colorClass}`}>{value}</div>
    </div>
  );
}
function Divider() { return <div className="border-t border-ink-100 my-1" />; }
function SubHeader({ children }: any) {
  return <div className="text-[10px] uppercase text-ink-500 font-bold tracking-wider pt-1">{children}</div>;
}

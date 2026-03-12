import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { type DateFormatOption, formatDisplayDate, toDateFnsFormat } from './format.js'
import { getPreferences, updatePreferences } from '#/server/preferences.js'

interface DateFormatContextValue {
  dateFormat: DateFormatOption
  dateFnsFormat: string
  formatDate: (isoStr: string) => string
  setDateFormat: (fmt: DateFormatOption) => void
}

const DateFormatContext = createContext<DateFormatContextValue>({
  dateFormat: 'DD/MM/YYYY',
  dateFnsFormat: 'dd/MM/yyyy',
  formatDate: (s) => formatDisplayDate(s, 'DD/MM/YYYY'),
  setDateFormat: () => {},
})

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const [dateFormat, setDateFormatState] = useState<DateFormatOption>('DD/MM/YYYY')

  useEffect(() => {
    getPreferences().then((prefs) => {
      const fmt = prefs.date_format as DateFormatOption
      if (fmt === 'DD/MM/YYYY' || fmt === 'YYYY-MM-DD') {
        setDateFormatState(fmt)
      }
    })
  }, [])

  const setDateFormat = useCallback((fmt: DateFormatOption) => {
    setDateFormatState(fmt)
    updatePreferences({ data: { date_format: fmt } })
  }, [])

  const formatDate = useCallback(
    (isoStr: string) => formatDisplayDate(isoStr, dateFormat),
    [dateFormat],
  )

  return (
    <DateFormatContext.Provider
      value={{
        dateFormat,
        dateFnsFormat: toDateFnsFormat(dateFormat),
        formatDate,
        setDateFormat,
      }}
    >
      {children}
    </DateFormatContext.Provider>
  )
}

export function useDateFormat() {
  return useContext(DateFormatContext)
}

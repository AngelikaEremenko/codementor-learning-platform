import { Link } from 'react-router-dom'
import { Star, Lightbulb, Trophy, BookOpen, Check } from 'lucide-react'

function Section({ title, icon, children }) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{
        fontSize: 17, fontWeight: 700, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8,
        color: 'var(--text)',
      }}>
        {icon}
        {title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
        {children}
      </div>
    </section>
  )
}

function Row({ icon, what, value }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr auto',
      gap: 12,
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--primary)', display: 'inline-flex' }}>{icon}</span>
      <span>{what}</span>
      <span style={{
        background: 'var(--success-light)',
        color: 'var(--success)',
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: 'nowrap',
      }}>{value}</span>
    </div>
  )
}

function Cost({ icon, what, value }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr auto',
      gap: 12,
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--primary)', display: 'inline-flex' }}>{icon}</span>
      <span>{what}</span>
      <span style={{
        background: 'var(--warning-light)',
        color: 'var(--warning)',
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: 'nowrap',
      }}>{value}</span>
    </div>
  )
}

export default function RulesPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, fontSize: 14, color: 'var(--text-muted)' }}>
        <Link to="/" style={{ color: 'var(--primary)' }}>Модули</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>Как это устроено</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Как устроены баллы и подсказки
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Короткая справка о том, как накапливается баланс и как им пользоваться.
      </p>

      <Section
        title="За что начисляются баллы"
        icon={<Star size={18} fill="#f59e0b" color="#f59e0b" />}
      >
        <p style={{ marginBottom: 10 }}>
          Баллы начисляются за реальное продвижение по курсу. Стартовый баланс
          при регистрации равен нулю, повторное выполнение одного и того же
          действия дополнительные баллы не приносит.
        </p>
        <Row
          icon={<BookOpen size={16} />}
          what="Полное прохождение теоретического раздела (мини-задания + тест ≥ 75%)"
          value="+1 балл"
        />
        <Row
          icon={<Check size={16} />}
          what="Первое успешное решение базовой задачи модуля"
          value="+1 балл"
        />
        <Row
          icon={<Check size={16} />}
          what="Первое успешное решение задачи среднего уровня"
          value="+2 балла"
        />
        <Row
          icon={<Check size={16} />}
          what="Первое успешное решение продвинутой задачи"
          value="+3 балла"
        />
        <Row
          icon={<Check size={16} />}
          what="Решение задачи-вариации (закрепление темы)"
          value="+1–2 балла"
        />
        <Row
          icon={<Trophy size={16} />}
          what="Полное прохождение модуля (все задачи решены)"
          value="+5 баллов"
        />
      </Section>

      <Section
        title="На что тратятся баллы"
        icon={<Lightbulb size={18} />}
      >
        <p style={{ marginBottom: 10 }}>
          Баллы расходуются исключительно на подсказки интеллектуального
          наставника в задачах. Любая другая активность бесплатна.
        </p>
        <Cost
          icon={<Lightbulb size={16} />}
          what="Подсказка первого уровня (наводящий вопрос)"
          value="бесплатно"
        />
        <Cost
          icon={<Lightbulb size={16} />}
          what="Подсказка второго уровня (конкретные средства языка)"
          value="3 балла"
        />
      </Section>

      <Section
        title="Как работают подсказки ИИ-наставника"
        icon={<Lightbulb size={18} />}
      >
        <p style={{ marginBottom: 8 }}>
          В каждой задаче подсказка выдаётся на одном из двух уровней:
        </p>
        <ul style={{ paddingLeft: 22, marginBottom: 12 }}>
          <li style={{ marginBottom: 6 }}>
            <b>Уровень 1.</b> Сократический наводящий вопрос. Наставник не
            называет ни конкретных функций, ни конструкций языка, а лишь
            направляет ход мысли. Получение такой подсказки бесплатно
            и поощряется системой.
          </li>
          <li>
            <b>Уровень 2.</b> Наставник называет конкретные средства языка
            (функции, типы данных, конструкции) и поясняет их роль в решении.
            Стоимость такой подсказки — 3 балла.
          </li>
        </ul>
        <p style={{ marginBottom: 8 }}>
          Уровень определяется автоматически в момент запроса по следующему
          правилу:
        </p>
        <ul style={{ paddingLeft: 22, marginBottom: 12 }}>
          <li style={{ marginBottom: 6 }}>
            при первом запросе по задаче выдаётся подсказка <b>уровня 1</b>;
          </li>
          <li style={{ marginBottom: 6 }}>
            если запросить ещё одну подсказку, <b>не изменив код</b> с момента
            прошлого запроса, уровень повышается до 2;
          </li>
          <li>
            если код заметно изменился, уровень <b>сбрасывается</b> обратно
            на 1, потому что прошлая подсказка уже была использована.
          </li>
        </ul>
        <p>
          Такая логика поощряет осмысленную работу с подсказками: если вы
          задумываетесь над вопросом наставника и пишете код, следующий
          запрос снова бесплатный.
        </p>
      </Section>

      <Section
        title="Как система выбирает следующую задачу"
        icon={<Check size={18} />}
      >
        <p style={{ marginBottom: 10 }}>
          Задачи модуля выдаются в порядке возрастания сложности. После
          успешного решения задачи система оценивает выполнение по трём
          критериям и решает, нужно ли вам дополнительное упражнение для
          закрепления темы:
        </p>
        <ul style={{ paddingLeft: 22, marginBottom: 10 }}>
          <li>задача решена быстро и без подсказок второго уровня — следующая задача;</li>
          <li>задача решена, но потребовалось время или подсказка — выдаётся вариация той же темы;</li>
          <li>после решения всех вариаций тема считается освоенной независимо от качества.</li>
        </ul>
        <p>
          Так платформа доводит до успеха каждого студента, не разрешая при
          этом «проскочить» сложную тему за один спешный заход.
        </p>
      </Section>

      <Section
        title="Несколько практических советов"
        icon={<BookOpen size={18} />}
      >
        <ul style={{ paddingLeft: 22 }}>
          <li style={{ marginBottom: 6 }}>
            <b>Сначала пробуйте сами.</b> Базовые задачи курса как правило
            решаются без подсказок — у вас достаточно теории для этого.
          </li>
          <li style={{ marginBottom: 6 }}>
            <b>Не бойтесь подсказок первого уровня.</b> Они бесплатны и
            помогают сдвинуться с мёртвой точки, не подменяя ваше решение.
          </li>
          <li>
            <b>Подсказка второго уровня — крайнее средство.</b> Если 3 балла
            кажутся существенной тратой, попробуйте сначала разобраться
            самостоятельно либо взять подсказку первого уровня.
          </li>
        </ul>
      </Section>
    </div>
  )
}

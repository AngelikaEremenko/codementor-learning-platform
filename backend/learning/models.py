from django.db import models
from django.conf import settings


class Module(models.Model):
    title = models.CharField('Название', max_length=200)
    description = models.TextField('Описание')
    # Короткий список ключевых концепций, изучаемых в модуле — передаётся
    # в ИИ-наставник, чтобы он не предлагал решения через темы будущих модулей.
    concepts = models.TextField('Ключевые концепции', blank=True)
    order = models.PositiveIntegerField('Порядок', default=0)
    is_active = models.BooleanField('Активен', default=True)

    class Meta:
        verbose_name = 'Учебный модуль'
        verbose_name_plural = 'Учебные модули'
        ordering = ['order']

    def __str__(self):
        return self.title


class Theory(models.Model):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='theories')
    title = models.CharField('Заголовок', max_length=200)
    content = models.TextField('Содержание')
    order = models.PositiveIntegerField('Порядок', default=0)

    class Meta:
        verbose_name = 'Теоретический материал'
        verbose_name_plural = 'Теоретические материалы'
        ordering = ['order']

    def __str__(self):
        return f'{self.module.title} — {self.title}'


class Tag(models.Model):
    slug = models.SlugField('Slug', max_length=50, unique=True)
    name = models.CharField('Название', max_length=80)

    class Meta:
        verbose_name = 'Тег'
        verbose_name_plural = 'Теги'
        ordering = ['name']

    def __str__(self):
        return self.name


class Task(models.Model):
    DIFFICULTY_CHOICES = [
        (1, 'Базовый'),
        (2, 'Средний'),
        (3, 'Продвинутый'),
    ]

    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField('Название', max_length=200)
    description = models.TextField('Условие задачи')
    difficulty = models.IntegerField('Уровень сложности', choices=DIFFICULTY_CHOICES)
    # Тест-кейсы: список пар {"input": "...", "expected": "..."}
    test_cases = models.JSONField('Тест-кейсы', default=list)
    hint_text = models.TextField('Подсказка (статическая)', blank=True)
    order = models.PositiveIntegerField('Порядок', default=0)
    tags = models.ManyToManyField(Tag, blank=True, related_name='tasks', verbose_name='Теги')
    # Если parent_task != None — это вариация для закрепления, не показывается в общем
    # списке задач модуля. Выдаётся студенту, который решил основную задачу «с трудом».
    parent_task = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='variations',
        verbose_name='Основная задача (если это вариация)',
    )

    class Meta:
        verbose_name = 'Задача'
        verbose_name_plural = 'Задачи'
        ordering = ['difficulty', 'order']

    def __str__(self):
        return f'[Уровень {self.difficulty}] {self.title}'


class MiniTask(models.Model):
    """Практическое мини-задание внутри теории. Кратко: задача с проверкой по тест-кейсам."""
    theory = models.ForeignKey(Theory, on_delete=models.CASCADE, related_name='mini_tasks')
    title = models.CharField('Название', max_length=200)
    description = models.TextField('Условие (markdown)')
    starter_code = models.TextField('Начальный код', blank=True)
    test_cases = models.JSONField('Тест-кейсы', default=list)
    hint = models.TextField('Подсказка', blank=True)
    order = models.PositiveIntegerField('Порядок', default=0)
    # Список словарей {"pattern": "...", "message": "..."} с обязательными
    # регулярками: код студента должен содержать каждую из них, иначе
    # задание не засчитывается, даже если все тесты прошли.
    required_patterns = models.JSONField(
        'Обязательные паттерны кода', default=list, blank=True
    )
    # Запрещённые паттерны: если код содержит любой из них — не засчитывается.
    forbidden_patterns = models.JSONField(
        'Запрещённые паттерны кода', default=list, blank=True
    )

    class Meta:
        verbose_name = 'Мини-задание'
        verbose_name_plural = 'Мини-задания'
        ordering = ['order']

    def __str__(self):
        return f'{self.theory.title} — {self.title}'


class Quiz(models.Model):
    theory = models.OneToOneField(Theory, on_delete=models.CASCADE, related_name='quiz')

    class Meta:
        verbose_name = 'Тест'
        verbose_name_plural = 'Тесты'

    def __str__(self):
        return f'Тест: {self.theory.title}'


class QuizQuestion(models.Model):
    OPTION_CHOICES = [('a', 'A'), ('b', 'B'), ('c', 'C'), ('d', 'D')]

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='questions')
    question = models.TextField('Вопрос')
    option_a = models.CharField('Вариант A', max_length=400)
    option_b = models.CharField('Вариант B', max_length=400)
    option_c = models.CharField('Вариант C', max_length=400)
    option_d = models.CharField('Вариант D', max_length=400)
    correct = models.CharField('Правильный ответ', max_length=1, choices=OPTION_CHOICES)
    explanation = models.TextField('Пояснение', blank=True)
    order = models.PositiveIntegerField('Порядок', default=0)

    class Meta:
        verbose_name = 'Вопрос теста'
        verbose_name_plural = 'Вопросы теста'
        ordering = ['order']

    def __str__(self):
        return f'{self.quiz} -- вопрос {self.order}'


class UserProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='progress')
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='user_progress')
    solved_count = models.IntegerField('Решено задач', default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Прогресс пользователя'
        verbose_name_plural = 'Прогресс пользователей'
        unique_together = ('user', 'module')

    def __str__(self):
        return f'{self.user} — {self.module} (решено {self.solved_count})'


class TheoryProgress(models.Model):
    """Прогресс пользователя по конкретной теории: мини-задания и квиз."""
    QUIZ_PASS_THRESHOLD = 0.75

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='theory_progress')
    theory = models.ForeignKey(Theory, on_delete=models.CASCADE, related_name='user_progress')
    # Список id мини-заданий (внутри theory), которые пользователь успешно прошёл
    mini_tasks_passed = models.JSONField('Сданные мини-задания', default=list)
    quiz_score = models.IntegerField('Правильных ответов', default=0)
    quiz_total = models.IntegerField('Всего вопросов', default=0)
    # Был ли уже начислен поинт за прохождение этой теории
    points_awarded = models.BooleanField('Поинт начислен', default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Прогресс по теории'
        verbose_name_plural = 'Прогресс по теориям'
        unique_together = ('user', 'theory')

    def __str__(self):
        return f'{self.user} — {self.theory.title}'

    @property
    def quiz_passed(self) -> bool:
        if self.quiz_total == 0:
            return False
        return self.quiz_score / self.quiz_total >= self.QUIZ_PASS_THRESHOLD

    def is_completed(self) -> bool:
        """Все мини-задания сданы И квиз пройден на >= 75%."""
        required_ids = set(self.theory.mini_tasks.values_list('id', flat=True))
        passed_ids = set(self.mini_tasks_passed or [])
        if not required_ids.issubset(passed_ids):
            return False
        # Если у теории есть квиз — он должен быть сдан
        if hasattr(self.theory, 'quiz'):
            return self.quiz_passed
        return True

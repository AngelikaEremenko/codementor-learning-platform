from django.db import models
from django.conf import settings


class Submission(models.Model):
    STATUS_CHOICES = [
        ('pending', 'На проверке'),
        ('accepted', 'Принято'),
        ('wrong', 'Неверно'),
        ('error', 'Ошибка выполнения'),
        ('timeout', 'Превышено время'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='submissions')
    task = models.ForeignKey('learning.Task', on_delete=models.CASCADE, related_name='submissions')
    code = models.TextField('Код решения')
    status = models.CharField('Статус', max_length=20, choices=STATUS_CHOICES, default='pending')
    # Результаты по каждому тест-кейсу
    test_results = models.JSONField('Результаты тестов', default=list)
    error_message = models.TextField('Сообщение об ошибке', blank=True)
    # Время выполнения задачи (с момента открытия до отправки), в секундах
    time_spent = models.IntegerField('Время выполнения (сек)', default=0)
    # Использовал ли пользователь подсказку ИИ (вычисляется как max_hint_level > 0)
    used_hint = models.BooleanField('Использовал подсказку', default=False)
    # Максимальный уровень подсказки, использованной для этой задачи к моменту submission.
    # 0 — подсказки не запрашивались, 1 — только наводящие, 2 — была конкретная.
    max_hint_level = models.IntegerField('Макс. уровень подсказки', default=0)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Решение'
        verbose_name_plural = 'Решения'
        ordering = ['-submitted_at']

    def __str__(self):
        return f'{self.user} — {self.task} ({self.status})'

    @property
    def is_accepted(self):
        return self.status == 'accepted'

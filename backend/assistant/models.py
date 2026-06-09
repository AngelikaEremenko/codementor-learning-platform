from django.db import models
from django.conf import settings


class HintRequest(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hint_requests')
    task = models.ForeignKey('learning.Task', on_delete=models.CASCADE, related_name='hint_requests')
    user_code = models.TextField('Код пользователя', blank=True)
    hint_text = models.TextField('Сгенерированная подсказка')
    hint_level = models.PositiveSmallIntegerField('Уровень подсказки', default=1)
    requested_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Запрос подсказки'
        verbose_name_plural = 'Запросы подсказок'

    def __str__(self):
        return f'{self.user} — {self.task} ({self.requested_at:%Y-%m-%d %H:%M})'

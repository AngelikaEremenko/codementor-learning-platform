import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    email = models.EmailField(unique=True)
    registered_at = models.DateTimeField(auto_now_add=True)
    points = models.IntegerField('Баллы', default=0)
    email_verified = models.BooleanField('Email подтверждён', default=False)
    avatar = models.ImageField(
        'Аватар', upload_to='avatars/', blank=True, null=True,
    )

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def __str__(self):
        return self.email


class EmailVerificationToken(models.Model):
    """Одноразовый токен для подтверждения email.

    Срок жизни: 24 часа. После использования удаляется.
    """
    LIFETIME_HOURS = 24

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='verification_tokens')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        verbose_name = 'Токен подтверждения email'
        verbose_name_plural = 'Токены подтверждения email'

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=self.LIFETIME_HOURS)
        super().save(*args, **kwargs)

    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    def __str__(self):
        return f'{self.user.email} — {self.token}'

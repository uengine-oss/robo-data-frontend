<script setup lang="ts">
import UnavailableCapability from './UnavailableCapability.vue'
</script>

<template>
  <UnavailableCapability
    title="알림 설정"
    description="알림 규칙과 전송 목적지를 관리할 서비스가 아직 연결되지 않았습니다. 이벤트 감지 규칙은 ‘이벤트 감지’ 화면에서 관리할 수 있습니다."
    :capabilities="[
      '알림 규칙 조회·생성·수정·삭제',
      '이메일, 웹훅 등 전송 목적지 관리',
      '전송 상태와 실패 이력 조회',
    ]"
  />
</template>

// RICHARDS · Firmware de bancada (ESP32 + sensor de vazão)
// ATENÇÃO: ESP32 GPIO é 3,3 V. Adeque sinal 5 V do sensor com divisor ou level shifter.
// Para instalação real, use sensor certificado, circuito protegido e HTTPS.
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include "secrets.h"
static const int FLOW_PIN=27;
static const unsigned long INTERVAL_MS=15000;
static const float PULSES_PER_LITER=450.0f; // valor inicial: calibrar com volume conhecido!
static const char* DEVICE_CODE="RICHARDS-FLOW-001";
volatile uint32_t pulseCounter=0;
portMUX_TYPE pulseMux=portMUX_INITIALIZER_UNLOCKED;
String bootId;
unsigned long lastSample=0;
uint32_t sequenceNo=0;
struct Reading { uint32_t sequence; float flowLpm, deltaLiters; String capturedAt; };
Reading queueData[12]; int queued=0;
void IRAM_ATTR pulseISR(){portENTER_CRITICAL_ISR(&pulseMux);pulseCounter++;portEXIT_CRITICAL_ISR(&pulseMux);}
String utcNow(){
  struct tm info;
  if(!getLocalTime(&info,1000)) return "";
  char buf[26]; strftime(buf,sizeof(buf),"%Y-%m-%dT%H:%M:%SZ",&info);
  return String(buf);
}
void connectWifi(){
 if(WiFi.status()==WL_CONNECTED)return;
 WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 Serial.println("Conectando Wi-Fi...");
 for(int i=0;i<16&&WiFi.status()!=WL_CONNECTED;i++)delay(350);
 if(WiFi.status()==WL_CONNECTED){Serial.print("IP: ");Serial.println(WiFi.localIP());configTime(0,0,"pool.ntp.org","time.google.com");}
}
void captureSample(unsigned long elapsed){
 uint32_t pulses;
 portENTER_CRITICAL(&pulseMux);pulses=pulseCounter;pulseCounter=0;portEXIT_CRITICAL(&pulseMux);
 const float liters=(float)pulses/PULSES_PER_LITER;
 const float lpm=liters*60000.0f/(float)elapsed;
 const String timestamp=utcNow();
 if(timestamp.length()==0){Serial.println("Sem hora NTP; descartando medição, não inventar timestamp");return;}
 if(queued>=12){for(int i=1;i<queued;i++)queueData[i-1]=queueData[i];queued--;Serial.println("Fila cheia: descartada a medição mais antiga");}
 queueData[queued++]={sequenceNo++,lpm,liters,timestamp};
 Serial.printf("Pulse=%lu, delta=%.3f L, vazao=%.3f L/min\n",(unsigned long)pulses,liters,lpm);
}
void flushQueue(){
 if(WiFi.status()!=WL_CONNECTED||!queued)return;
 Reading r=queueData[0];
 HTTPClient http;http.setTimeout(6000);http.begin(RICHARDS_API_URL);
 http.addHeader("Content-Type","application/json");
 http.addHeader("x-device-key",RICHARDS_DEVICE_KEY);
 // A chave é enviada apenas na rede de laboratório; em produção USE TLS e CA verificada.
 String payload="{\"deviceCode\":\""+String(DEVICE_CODE)+"\",\"bootId\":\""+bootId+
  "\",\"sequence\":"+String(r.sequence)+",\"flowLpm\":"+String(r.flowLpm,3)+
  ",\"deltaLiters\":"+String(r.deltaLiters,3)+",\"capturedAt\":\""+r.capturedAt+"\"}";
 int status=http.POST(payload);
 Serial.printf("RICHARDS POST => %d\n",status);
 http.end();
 if(status==202){for(int i=1;i<queued;i++)queueData[i-1]=queueData[i];queued--;}
 if(status==422){ // relógio atrasado ou validação incompatível: não prender fila indefinidamente
   Serial.println("Registro rejeitado; revisar sincronização/contrato. Descartando este registro.");
   for(int i=1;i<queued;i++)queueData[i-1]=queueData[i];queued--;
 }
}
void setup(){
 Serial.begin(115200);pinMode(FLOW_PIN,INPUT_PULLUP);
 attachInterrupt(digitalPinToInterrupt(FLOW_PIN),pulseISR,RISING);
 bootId=String((uint32_t)esp_random(),HEX)+String((uint32_t)esp_random(),HEX);
 connectWifi();lastSample=millis();
}
void loop(){
 unsigned long now=millis();
 if(now-lastSample>=INTERVAL_MS){unsigned long elapsed=now-lastSample;lastSample=now;captureSample(elapsed);}
 if(WiFi.status()!=WL_CONNECTED){static unsigned long lastTry=0;if(millis()-lastTry>10000){connectWifi();lastTry=millis();}}
 static unsigned long lastPost=0;
 if(millis()-lastPost>1500){flushQueue();lastPost=millis();}
 delay(10);
}

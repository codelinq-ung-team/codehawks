// The room's sky: floor color at the horizon, rising to near white overhead.
Shader "Advisor/Sky"
{
    Properties
    {
        _Low ("Low", Color) = (0.94,0.91,0.87,1)
        _High ("High", Color) = (0.99,0.98,0.97,1)
    }
    SubShader
    {
        Tags { "RenderType" = "Background" "Queue" = "Background" }
        Pass
        {
            ZWrite Off
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            fixed4 _Low;
            fixed4 _High;

            struct appdata
            {
                float4 vertex : POSITION;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 dir : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert (appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(v2f, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.dir = v.vertex.xyz;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float h = smoothstep(0.0, 0.7, normalize(i.dir).y);
                return lerp(_Low, _High, h);
            }
            ENDCG
        }
    }
}

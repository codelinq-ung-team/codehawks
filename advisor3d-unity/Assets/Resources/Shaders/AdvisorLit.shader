// Soft diffuse shading with the light built in (a sky/ground fill plus one sun), matching the
// WebXR room's HemisphereLight and DirectionalLight. Used for Pip and the result blocks.
Shader "Advisor/Lit"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _Emission ("Emission", Color) = (0,0,0,0)
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst", Float) = 0
        [Enum(Off,0,On,1)] _ZWrite ("ZWrite", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        Pass
        {
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            fixed4 _Color;
            fixed4 _Emission;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                fixed4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                fixed4 color : COLOR;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert (appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(v2f, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                fixed4 c = v.color;
                float3 ground = float3(0.902, 0.847, 0.812);
                #ifndef UNITY_COLORSPACE_GAMMA
                c.rgb = GammaToLinearSpace(c.rgb);
                ground = GammaToLinearSpace(ground);
                #endif
                float3 n = UnityObjectToWorldNormal(v.normal);
                float3 sun = normalize(float3(1.5, 3.0, -2.5));
                float3 light = 0.764 * lerp(ground, float3(1, 1, 1), n.y * 0.5 + 0.5) + 0.477 * saturate(dot(n, sun));
                c *= _Color;
                o.color = fixed4(saturate(c.rgb * light + _Emission.rgb), c.a);
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                return i.color;
            }
            ENDCG
        }
    }
}

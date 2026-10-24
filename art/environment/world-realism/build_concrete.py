"""Original, tileable concrete aggregate PBR textures; no external image inputs."""
from pathlib import Path
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[3];out=R/'public/assets/environment/metropolis';rng=np.random.default_rng(72015);n=512
fx=np.fft.fftfreq(n);fy=np.fft.rfftfreq(n);radius=np.sqrt(fx[:,None]**2+fy[None,:]**2);radius[0,0]=1
white=rng.normal(size=(n,n));field=np.fft.irfft2(np.fft.rfft2(white)/np.maximum(radius,.015)**.8,s=(n,n));field=(field-field.mean())/field.std()
grit=rng.normal(size=(n,n));pores=np.clip((rng.random((n,n))-.985)*58,0,1)
height=field*.018+grit*.014-pores*.14
value=np.clip(.70+field*.025+grit*.023-pores*.15,.28,.85)
color=np.stack([value*1.025,value*1.005,value*.965],axis=-1);Image.fromarray((np.clip(color,0,1)*255).astype('uint8')).save(out/'concrete-color.webp',quality=91)
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*1.4;dy=(np.roll(height,-1,0)-np.roll(height,1,0))*1.4
normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
Image.fromarray(((normal*.5+.5)*255).astype('uint8')).save(out/'concrete-normal.webp',quality=92)
rough=np.clip(.84+field*.028+pores*.08,.65,.98);Image.fromarray((rough*255).astype('uint8')).save(out/'concrete-rough.webp',quality=88)
Image.fromarray(((height-height.min())/(height.max()-height.min())*65535).astype('uint16')).save(R/'art/environment/world-realism/concrete-height.png')
print('Original 512px tileable concrete maps saved')

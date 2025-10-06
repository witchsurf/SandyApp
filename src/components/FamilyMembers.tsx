import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FamilyMember } from '../types/database';
import { demoFamilyMembers } from '../data/demoData';

export function FamilyMembers() {
  const [members, setMembers] = useState<FamilyMember[]>([]);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .order('age_group', { ascending: false });

      if (!error && data && data.length > 0) {
        setMembers(data);
      } else {
        setMembers(demoFamilyMembers);
      }
    } catch (error) {
      console.warn('Impossible de charger les membres depuis Supabase:', error);
      setMembers(demoFamilyMembers);
    }
  }

  const getAgeLabel = (ageGroup: string) => {
    switch (ageGroup) {
      case 'adult': return 'Adulte';
      case 'teenager': return 'Ado';
      case 'toddler': return '2½ ans';
      default: return '';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">Membres de la famille</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {members.map((member) => (
          <div key={member.id} className="flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold mb-2 shadow-md"
              style={{ backgroundColor: member.avatar_color }}
            >
              {member.name[0]}
            </div>
            <p className="text-sm font-medium text-gray-900">{member.name}</p>
            <p className="text-xs text-gray-500">{getAgeLabel(member.age_group)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
